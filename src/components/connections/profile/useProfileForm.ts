import { useState, useEffect } from 'react';
import { useConnectionStore } from '../../../stores/connectionStore';
import { useConnectionJsonStore } from '../../../stores/connectionJsonStore';
import type { ConnectionMode, ConnectionProfile, SessionConfig, ReconnectRetryConfig } from '../../../types/zenoh';
import {
  hasCustomTlsConfig,
  resolveTlsConfig,
  isTlsEnabled,
  parseLocator,
  buildLocator,
  detectProfilePreset,
  getSuggestedRouterPort,
  DEFAULT_TRANSPORT_PROTOCOL,
  type TransportProtocol,
  type ConnectionPreset,
} from '../../../lib/tls';
import { formatFriendlyError } from '../../../lib/errorUtils';
import type { RouterListenEndpoint } from './RouterConfigForm';

export interface UseProfileFormProps {
  isOpen: boolean;
  profile?: ConnectionProfile | null;
  onClose: () => void;
  onSaved?: (profile: ConnectionProfile) => void;
}

export function isValidPort(port: string): boolean {
  if (!port || typeof port !== 'string') return false;
  const trimmed = port.trim();
  if (!/^\d+$/.test(trimmed)) return false;
  const num = parseInt(trimmed, 10);
  return !isNaN(num) && num >= 0 && num <= 65535;
}

export function isValidUnixPath(path: string): boolean {
  if (!path || typeof path !== 'string') return false;
  const trimmed = path.trim();
  return trimmed.length > 0 && trimmed.startsWith('/');
}

const DEFAULT_RECONNECT_RETRY_CONFIG: ReconnectRetryConfig = {
  period_init_ms: 1000,
  period_max_ms: 10000,
  factor: 2,
  timeout_ms: 30000,
};

export function useProfileForm({ isOpen, profile, onClose, onSaved }: UseProfileFormProps) {
  const saveProfileToStore = useConnectionStore((state) => state.saveProfile);
  const saveAndConnectToStore = useConnectionStore((state) => state.saveAndConnect);
  const testConnectionIpc = useConnectionStore((state) => state.testConnection);

  const isEditing = Boolean(profile?.id);

  // Preset Selection: 'client' | 'peer' | 'router'
  const [preset, setPreset] = useState<ConnectionPreset>('client');
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

  // Client Mode Form State
  const [clientName, setClientName] = useState<string>('Client Router');
  const [clientHost, setClientHost] = useState<string>('127.0.0.1');
  const [clientPort, setClientPort] = useState<string>('7447');
  const [clientProtocol, setClientProtocol] = useState<TransportProtocol>(DEFAULT_TRANSPORT_PROTOCOL);
  const [enableReconnectRetry, setEnableReconnectRetry] = useState<boolean>(true);

  // Peer Mode Form State
  const [peerName, setPeerName] = useState<string>('Local Peer');
  const [connectLocators, setConnectLocators] = useState<string[]>([]);
  const [listenLocators, setListenLocators] = useState<string[]>([]);
  const [scoutMulticast, setScoutMulticast] = useState<boolean>(true);
  const [scoutGossip, setScoutGossip] = useState<boolean>(true);

  // Router Mode Form State
  const [routerName, setRouterName] = useState<string>('Local Router');
  const [routerListenEndpoints, setRouterListenEndpoints] = useState<RouterListenEndpoint[]>([
    { id: 'ep-1', protocol: 'tcp', host: '0.0.0.0', port: '7447' },
  ]);
  const [routerScoutMulticast, setRouterScoutMulticast] = useState<boolean>(true);
  const [routerScoutGossip, setRouterScoutGossip] = useState<boolean>(true);
  const [routerConnectLocators, setRouterConnectLocators] = useState<string[]>([]);

  // Auth State
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [token, setToken] = useState<string>('');

  // TLS State
  const [enableTls, setEnableTls] = useState<boolean>(false);
  const [useCustomTls, setUseCustomTls] = useState<boolean>(false);
  const [tlsOnly, setTlsOnly] = useState<boolean>(false);
  const [caCert, setCaCert] = useState<string>('');
  const [clientCert, setClientCert] = useState<string>('');
  const [clientKey, setClientKey] = useState<string>('');

  // Custom JSON Config Overrides
  const [customConfigText, setCustomConfigText] = useState<string>('');

  // UI State
  const [validationError, setValidationError] = useState<string | null>(null);
  const [testSuccessMessage, setTestSuccessMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isTesting, setIsTesting] = useState<boolean>(false);

  // Populate state whenever panel opens or profile changes
  useEffect(() => {
    if (isOpen) {
      if (profile) {
        const detected = detectProfilePreset(profile);
        setPreset(detected);
        setShowAdvanced(false);

        setConnectLocators(profile.connect_locators ? [...profile.connect_locators] : []);
        setListenLocators(profile.listen_locators ? [...profile.listen_locators] : []);
        setScoutMulticast(profile.scout_multicast ?? true);
        setScoutGossip(profile.scout_gossip ?? true);
        setRouterScoutGossip(profile.scout_gossip ?? true);
        setEnableReconnectRetry(profile.reconnect_retry !== null && profile.reconnect_retry !== undefined);

        setUsername(profile.user_auth?.username || '');
        setPassword(profile.user_auth?.password || '');
        setToken(profile.user_auth?.token || '');

        const isTlsOn = isTlsEnabled(profile.tls_config, profile.connect_locators);
        const hasCustomTls = hasCustomTlsConfig(profile.tls_config);
        setEnableTls(isTlsOn);
        setUseCustomTls(hasCustomTls);
        setTlsOnly(profile.tls_config?.tls_only ?? false);
        setCaCert(profile.tls_config?.ca_cert || '');
        setClientCert(profile.tls_config?.client_cert || '');
        setClientKey(profile.tls_config?.client_key || '');

        // Populate client form if client mode
        if (profile.connect_locators && profile.connect_locators.length === 1) {
          const parsed = parseLocator(profile.connect_locators[0]);
          if (parsed) {
            setClientHost(parsed.host);
            setClientPort(parsed.port);
            setClientProtocol((parsed.protocol as TransportProtocol) || DEFAULT_TRANSPORT_PROTOCOL);
          } else {
            setClientHost('');
            setClientPort('7447');
            setClientProtocol(DEFAULT_TRANSPORT_PROTOCOL);
          }
        } else {
          setClientHost('');
          setClientPort('7447');
          setClientProtocol(isTlsOn ? 'tls' : DEFAULT_TRANSPORT_PROTOCOL);
        }
        setClientName(profile.name || 'Client Router');

        // Populate peer form if peer mode
        setPeerName(profile.name || 'Local Peer');

        // Populate router form if router mode
        if (profile.listen_locators && profile.listen_locators.length > 0) {
          const eps: RouterListenEndpoint[] = profile.listen_locators.map((loc, idx) => {
            const parsed = parseLocator(loc);
            return {
              id: `ep-${idx + 1}-${Date.now()}`,
              protocol: (parsed?.protocol as TransportProtocol) || 'tcp',
              host: parsed?.host || '0.0.0.0',
              port:
                parsed?.port !== undefined && parsed.port !== ''
                  ? parsed.port
                  : (parsed?.protocol === 'unix' ? '' : '7447'),
            };
          });
          setRouterListenEndpoints(eps);
        } else {
          setRouterListenEndpoints([
            { id: `ep-1`, protocol: 'tcp', host: '0.0.0.0', port: '7447' },
          ]);
        }
        setRouterName(profile.name || 'Local Router');
        setRouterScoutMulticast(profile.scout_multicast ?? true);
        setRouterConnectLocators(profile.connect_locators ? [...profile.connect_locators] : []);

        if (profile.custom_config && Object.keys(profile.custom_config).length > 0) {
          setCustomConfigText(JSON.stringify(profile.custom_config, null, 2));
        } else {
          setCustomConfigText('');
        }
      } else {
        // Defaults for new connection profile
        setPreset('client');
        setShowAdvanced(false);

        setClientName('Client Router');
        setClientHost('127.0.0.1');
        setClientPort('7447');
        setClientProtocol(DEFAULT_TRANSPORT_PROTOCOL);
        setEnableReconnectRetry(true);

        setPeerName('Local Peer');
        setConnectLocators([]);
        setListenLocators([]);
        setScoutMulticast(true);
        setScoutGossip(true);

        const suggestedPort = getSuggestedRouterPort(useConnectionStore.getState().profiles);
        setRouterName('Local Router');
        setRouterListenEndpoints([
          { id: `ep-1`, protocol: 'tcp', host: '0.0.0.0', port: suggestedPort },
        ]);
        setRouterScoutMulticast(true);
        setRouterScoutGossip(true);
        setRouterConnectLocators([]);

        setUsername('');
        setPassword('');
        setToken('');
        setEnableTls(false);
        setUseCustomTls(false);
        setCaCert('');
        setClientCert('');
        setClientKey('');
        setCustomConfigText('');
      }
      setValidationError(null);
      setTestSuccessMessage(null);
      setIsSaving(false);
      setIsTesting(false);
    }
  }, [isOpen, profile]);

  // Peer Connect Locators Helpers
  const addConnectLocator = () => {
    setConnectLocators((prev) => [...prev, '']);
  };

  const updateConnectLocator = (index: number, val: string) => {
    setConnectLocators((prev) => {
      const next = [...prev];
      next[index] = val;
      return next;
    });
  };

  const removeConnectLocator = (index: number) => {
    setConnectLocators((prev) => prev.filter((_, i) => i !== index));
  };

  // Peer Listen Locators Helpers
  const addListenLocator = () => {
    setListenLocators((prev) => [...prev, '']);
  };

  const updateListenLocator = (index: number, val: string) => {
    setListenLocators((prev) => {
      const next = [...prev];
      next[index] = val;
      return next;
    });
  };

  const removeListenLocator = (index: number) => {
    setListenLocators((prev) => prev.filter((_, i) => i !== index));
  };

  // Router Listen Endpoints Helpers
  const addRouterListenEndpoint = () => {
    setRouterListenEndpoints((prev) => {
      const newId = `ep-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
      const hasTls = prev.some((e) => e.protocol === 'tls');
      const nextProto: TransportProtocol = hasTls ? 'quic' : 'tls';
      const nextPort = nextProto === 'tls' ? '7446' : '7448';
      return [
        ...prev,
        { id: newId, protocol: nextProto, host: '0.0.0.0', port: nextPort },
      ];
    });
  };

  const updateRouterListenEndpoint = (id: string, updates: Partial<RouterListenEndpoint>) => {
    setRouterListenEndpoints((prev) =>
      prev.map((ep) => (ep.id === id ? { ...ep, ...updates } : ep))
    );
  };

  const removeRouterListenEndpoint = (id: string) => {
    setRouterListenEndpoints((prev) =>
      prev.length > 1 ? prev.filter((ep) => ep.id !== id) : prev
    );
  };

  // Router Connect Locators Helpers
  const addRouterConnectLocator = () => {
    setRouterConnectLocators((prev) => [...prev, '']);
  };

  const updateRouterConnectLocator = (index: number, val: string) => {
    setRouterConnectLocators((prev) => {
      const next = [...prev];
      next[index] = val;
      return next;
    });
  };

  const removeRouterConnectLocator = (index: number) => {
    setRouterConnectLocators((prev) => prev.filter((_, i) => i !== index));
  };

  // Form Validation
  const validate = (): boolean => {
    if (preset === 'client') {
      if (!clientName.trim()) {
        setValidationError('Profile Name is required.');
        return false;
      }
      if (clientProtocol === 'unix') {
        if (!clientHost.trim()) {
          setValidationError('Unix socket path is required (e.g. /tmp/zenoh.sock).');
          return false;
        }
        if (!isValidUnixPath(clientHost)) {
          setValidationError('Unix socket path must start with "/" (e.g. /tmp/zenoh.sock).');
          return false;
        }
      } else {
        if (!clientHost.trim()) {
          setValidationError('Router Address is required (e.g. 127.0.0.1 or router.zenoh.io).');
          return false;
        }
        if (!isValidPort(clientPort)) {
          setValidationError('Port must be a valid integer between 0 and 65535.');
          return false;
        }
      }
    } else if (preset === 'peer') {
      if (!peerName.trim()) {
        setValidationError('Profile Name is required.');
        return false;
      }
      for (let i = 0; i < connectLocators.length; i++) {
        const loc = connectLocators[i].trim();
        if (loc) {
          const parsed = parseLocator(loc);
          if (!parsed) {
            setValidationError(`Direct link #${i + 1} "${loc}" is not a valid Zenoh locator.`);
            return false;
          }
          if (parsed.protocol === 'unix' && !isValidUnixPath(parsed.host)) {
            setValidationError(`Direct link #${i + 1} Unix socket path must start with "/".`);
            return false;
          }
          if (parsed.protocol !== 'unix' && parsed.port && !isValidPort(parsed.port)) {
            setValidationError(`Direct link #${i + 1} port "${parsed.port}" must be between 0 and 65535.`);
            return false;
          }
        }
      }
      for (let i = 0; i < listenLocators.length; i++) {
        const loc = listenLocators[i].trim();
        if (loc) {
          const parsed = parseLocator(loc);
          if (!parsed) {
            setValidationError(`Listen endpoint #${i + 1} "${loc}" is not a valid Zenoh locator.`);
            return false;
          }
          if (parsed.protocol === 'unix' && !isValidUnixPath(parsed.host)) {
            setValidationError(`Listen endpoint #${i + 1} Unix socket path must start with "/".`);
            return false;
          }
          if (parsed.protocol !== 'unix' && parsed.port && !isValidPort(parsed.port)) {
            setValidationError(`Listen endpoint #${i + 1} port "${parsed.port}" must be between 0 and 65535.`);
            return false;
          }
        }
      }
    } else if (preset === 'router') {
      if (!routerName.trim()) {
        setValidationError('Router Profile Name is required.');
        return false;
      }
      if (routerListenEndpoints.length === 0) {
        setValidationError('At least one listen endpoint is required.');
        return false;
      }
      for (let i = 0; i < routerListenEndpoints.length; i++) {
        const ep = routerListenEndpoints[i];
        if (ep.protocol === 'unix') {
          if (!ep.host.trim()) {
            setValidationError(`Endpoint #${i + 1} Unix socket path is required (e.g. /tmp/zenoh.sock).`);
            return false;
          }
          if (!isValidUnixPath(ep.host)) {
            setValidationError(`Endpoint #${i + 1} Unix socket path must start with "/" (e.g. /tmp/zenoh.sock).`);
            return false;
          }
        } else {
          if (!isValidPort(ep.port)) {
            setValidationError(`Endpoint #${i + 1} port "${ep.port}" must be a valid integer between 0 and 65535 (use 0 for auto).`);
            return false;
          }
        }
      }
      for (let i = 0; i < routerConnectLocators.length; i++) {
        const loc = routerConnectLocators[i].trim();
        if (loc) {
          const parsed = parseLocator(loc);
          if (!parsed) {
            setValidationError(`Upstream router #${i + 1} "${loc}" is not a valid Zenoh locator.`);
            return false;
          }
          if (parsed.protocol === 'unix' && !isValidUnixPath(parsed.host)) {
            setValidationError(`Upstream router #${i + 1} Unix socket path must start with "/".`);
            return false;
          }
          if (parsed.protocol !== 'unix' && parsed.port && !isValidPort(parsed.port)) {
            setValidationError(`Upstream router #${i + 1} port "${parsed.port}" must be between 0 and 65535.`);
            return false;
          }
        }
      }
    }

    if (customConfigText.trim()) {
      try {
        const parsed = JSON.parse(customConfigText);
        if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) {
          setValidationError('Custom configuration must be a valid JSON object.');
          return false;
        }
      } catch (err) {
        setValidationError(`Invalid JSON in custom configuration: ${(err as Error).message}`);
        return false;
      }
    }

    setValidationError(null);
    return true;
  };

  const buildCurrentSessionConfig = (): SessionConfig & { id?: string; zid?: string } => {
    const userAuth =
      username.trim() || password.trim() || token.trim()
        ? {
            username: username.trim() || undefined,
            password: password.trim() || undefined,
            token: token.trim() || undefined,
          }
        : null;

    let customConfigObj: Record<string, unknown> | null = null;
    if (customConfigText.trim()) {
      try {
        customConfigObj = JSON.parse(customConfigText);
      } catch {
        // Handled by validate()
      }
    }

    const reconnectRetryConfig: ReconnectRetryConfig | null = enableReconnectRetry
      ? (profile?.reconnect_retry || DEFAULT_RECONNECT_RETRY_CONFIG)
      : null;

    if (preset === 'client') {
      const locator = buildLocator(clientProtocol, clientHost, clientPort);
      const isEncrypted = clientProtocol === 'tls' || clientProtocol === 'wss';
      const tlsConfig = resolveTlsConfig({
        enableTls: isEncrypted,
        useCustomTls,
        caCert,
        clientCert,
        clientKey,
        tlsOnly,
      });
      const activeZid = profile?.id
        ? useConnectionStore.getState().activeSessions[profile.id]?.zid
        : (profile as any)?.zid;
      return {
        profile_id: profile?.id,
        id: activeZid || profile?.id,
        zid: activeZid,
        mode: 'client',
        connect_locators: locator ? [locator] : [],
        listen_locators: [],
        scout_multicast: false,
        scout_gossip: false,
        reconnect_retry: reconnectRetryConfig,
        user_auth: userAuth,
        tls_config: tlsConfig,
        custom_config: customConfigObj,
      };
    } else if (preset === 'peer') {
      const tlsConfig = resolveTlsConfig({
        enableTls,
        useCustomTls,
        caCert,
        clientCert,
        clientKey,
        tlsOnly,
      });
      const activeZid = profile?.id
        ? useConnectionStore.getState().activeSessions[profile.id]?.zid
        : (profile as any)?.zid;
      return {
        profile_id: profile?.id,
        id: activeZid || profile?.id,
        zid: activeZid,
        mode: 'peer',
        connect_locators: connectLocators.map((l) => l.trim()).filter(Boolean),
        listen_locators: listenLocators.map((l) => l.trim()).filter(Boolean),
        scout_multicast: scoutMulticast,
        scout_gossip: scoutGossip,
        reconnect_retry: reconnectRetryConfig,
        user_auth: null,
        tls_config: tlsConfig,
        custom_config: customConfigObj,
      };
    } else if (preset === 'router') {
      const listenLocs = routerListenEndpoints
        .map((ep) => buildLocator(ep.protocol, ep.host.trim() || (ep.protocol === 'unix' ? '/tmp/zenoh.sock' : '0.0.0.0'), ep.port.trim()))
        .filter(Boolean);
      const hasTlsEndpoint = routerListenEndpoints.some((ep) => ep.protocol === 'tls' || ep.protocol === 'wss');
      const tlsConfig = resolveTlsConfig({
        enableTls: hasTlsEndpoint || enableTls || useCustomTls,
        useCustomTls,
        caCert,
        clientCert,
        clientKey,
        tlsOnly,
      });
      const activeZid = profile?.id
        ? useConnectionStore.getState().activeSessions[profile.id]?.zid
        : (profile as any)?.zid;
      return {
        profile_id: profile?.id,
        id: activeZid || profile?.id,
        zid: activeZid,
        mode: 'router',
        connect_locators: routerConnectLocators.map((l) => l.trim()).filter(Boolean),
        listen_locators: listenLocs.length > 0 ? listenLocs : ['tcp/0.0.0.0:7447'],
        scout_multicast: routerScoutMulticast,
        scout_gossip: routerScoutGossip,
        reconnect_retry: reconnectRetryConfig,
        user_auth: userAuth,
        tls_config: tlsConfig,
        custom_config: customConfigObj,
      };
    }

    return {
      profile_id: profile?.id,
      mode: 'client',
      connect_locators: [],
      listen_locators: [],
      scout_multicast: false,
      scout_gossip: false,
      reconnect_retry: reconnectRetryConfig,
      user_auth: userAuth,
      tls_config: null,
      custom_config: customConfigObj,
    };
  };

  const handleTestConnection = async () => {
    if (!validate()) return;
    setIsTesting(true);
    setValidationError(null);
    setTestSuccessMessage(null);

    try {
      const config = buildCurrentSessionConfig();
      const res = await testConnectionIpc(config);
      setIsTesting(false);
      if (res.success) {
        setTestSuccessMessage(res.message);
      } else {
        const friendly = formatFriendlyError(res.message, 'Connection Test Failed').fullMessage;
        setValidationError(friendly);
      }
    } catch (err) {
      setIsTesting(false);
      const friendly = formatFriendlyError(err, 'Connection Test Failed').fullMessage;
      setValidationError(friendly);
    }
  };

  // Save handler
  const handleSave = async (andConnect: boolean = false) => {
    if (!validate()) return;

    setIsSaving(true);
    setValidationError(null);
    setTestSuccessMessage(null);

    try {
      let customConfigObj: Record<string, unknown> | null = null;
      if (customConfigText.trim()) {
        customConfigObj = JSON.parse(customConfigText);
      }

      const userAuth =
        username.trim() || password.trim() || token.trim()
          ? {
              username: username.trim() || undefined,
              password: password.trim() || undefined,
              token: token.trim() || undefined,
            }
          : null;

      const reconnectRetryConfig: ReconnectRetryConfig | null = enableReconnectRetry
        ? (profile?.reconnect_retry || DEFAULT_RECONNECT_RETRY_CONFIG)
        : null;

      let finalName = '';
      let finalMode: ConnectionMode = 'client';
      let finalConnectLocators: string[] = [];
      let finalListenLocators: string[] = [];
      let finalScoutMulticast = false;
      let finalScoutGossip = true;
      let finalTlsConfig = resolveTlsConfig({
        enableTls,
        useCustomTls,
        caCert,
        clientCert,
        clientKey,
        tlsOnly,
      });

      if (preset === 'client') {
        finalName = clientName.trim();
        finalMode = 'client';
        finalScoutMulticast = false;
        finalScoutGossip = false;
        const locator = buildLocator(clientProtocol, clientHost, clientPort);
        finalConnectLocators = locator ? [locator] : [];
        finalListenLocators = [];
        const isEncrypted = clientProtocol === 'tls' || clientProtocol === 'wss';
        finalTlsConfig = resolveTlsConfig({
          enableTls: isEncrypted,
          useCustomTls,
          caCert,
          clientCert,
          clientKey,
          tlsOnly,
        });
      } else if (preset === 'peer') {
        finalName = peerName.trim();
        finalMode = 'peer';
        finalScoutMulticast = scoutMulticast;
        finalScoutGossip = scoutGossip;
        finalConnectLocators = connectLocators.map((l) => l.trim()).filter(Boolean);
        finalListenLocators = listenLocators.map((l) => l.trim()).filter(Boolean);
        finalTlsConfig = resolveTlsConfig({
          enableTls: enableTls || useCustomTls || Boolean(caCert || clientCert || clientKey),
          useCustomTls: useCustomTls || Boolean(caCert || clientCert || clientKey),
          caCert,
          clientCert,
          clientKey,
          tlsOnly,
        });
      } else if (preset === 'router') {
        finalName = routerName.trim();
        finalMode = 'router';
        finalScoutMulticast = routerScoutMulticast;
        finalScoutGossip = routerScoutGossip;
        const listenLocs = routerListenEndpoints
          .map((ep) => buildLocator(ep.protocol, ep.host.trim() || (ep.protocol === 'unix' ? '/tmp/zenoh.sock' : '0.0.0.0'), ep.port.trim()))
          .filter(Boolean);
        finalListenLocators = listenLocs.length > 0 ? listenLocs : ['tcp/0.0.0.0:7447'];
        finalConnectLocators = routerConnectLocators.map((l) => l.trim()).filter(Boolean);
        const hasTlsEndpoint = routerListenEndpoints.some((ep) => ep.protocol === 'tls' || ep.protocol === 'wss');
        finalTlsConfig = resolveTlsConfig({
          enableTls: hasTlsEndpoint || enableTls || useCustomTls,
          useCustomTls: useCustomTls || Boolean(caCert || clientCert || clientKey),
          caCert,
          clientCert,
          clientKey,
          tlsOnly,
        });
      }

      const now = Date.now();
      const updatedProfile: ConnectionProfile = {
        id: profile?.id || crypto.randomUUID(),
        name: finalName,
        mode: finalMode,
        connect_locators: finalConnectLocators,
        listen_locators: finalListenLocators,
        scout_multicast: finalScoutMulticast,
        scout_gossip: finalScoutGossip,
        reconnect_retry: reconnectRetryConfig,
        user_auth: userAuth,
        tls_config: finalTlsConfig,
        custom_config: customConfigObj,
        created_at: profile?.created_at || now,
        updated_at: now,
      };

      if (andConnect) {
        await saveAndConnectToStore(updatedProfile);
      } else {
        await saveProfileToStore(updatedProfile);
      }

      if (onSaved) {
        onSaved(updatedProfile);
      }

      setIsSaving(false);
      onClose();
    } catch (err) {
      setIsSaving(false);
      const friendly = formatFriendlyError(err, 'Save Profile Failed').fullMessage;
      setValidationError(friendly);
    }
  };

  const syncEditFormJson = useConnectionJsonStore((s) => s.syncEditFormJson);
  const parseJsonToProfile = useConnectionJsonStore((s) => s.parseJsonToProfile);

  const currentSessionConfig = buildCurrentSessionConfig();
  const generatedConfigJson = syncEditFormJson(currentSessionConfig);

  const applyJsonToForm = (jsonString: string): boolean => {
    const parsed = parseJsonToProfile(jsonString);
    if (!parsed) return false;

    if (parsed.mode === 'router' || parsed.mode === 'peer' || parsed.mode === 'client') {
      setPreset(parsed.mode);
    }
    if (parsed.connect_locators && parsed.connect_locators.length > 0) {
      setConnectLocators(parsed.connect_locators);
      setRouterConnectLocators(parsed.connect_locators);
      const parsedFirst = parseLocator(parsed.connect_locators[0]);
      if (parsedFirst) {
        setClientHost(parsedFirst.host);
        setClientPort(parsedFirst.port);
        setClientProtocol((parsedFirst.protocol as TransportProtocol) || DEFAULT_TRANSPORT_PROTOCOL);
      }
    }
    if (parsed.listen_locators) {
      setListenLocators(parsed.listen_locators);
      const eps: RouterListenEndpoint[] = parsed.listen_locators.map((loc, idx) => {
        const p = parseLocator(loc);
        return {
          id: `ep-${idx + 1}-${Date.now()}`,
          protocol: (p?.protocol as TransportProtocol) || 'tcp',
          host: p?.host || '0.0.0.0',
          port: p?.port !== undefined && p.port !== '' ? p.port : (p?.protocol === 'unix' ? '' : '7447'),
        };
      });
      if (eps.length > 0) {
        setRouterListenEndpoints(eps);
      }
    }
    if (typeof parsed.scout_multicast === 'boolean') {
      setScoutMulticast(parsed.scout_multicast);
      setRouterScoutMulticast(parsed.scout_multicast);
    }
    if (typeof parsed.scout_gossip === 'boolean') {
      setScoutGossip(parsed.scout_gossip);
      setRouterScoutGossip(parsed.scout_gossip);
    }
    return true;
  };

  return {
    isEditing,
    preset,
    setPreset,
    showAdvanced,
    setShowAdvanced,
    clientName,
    setClientName,
    clientHost,
    setClientHost,
    clientPort,
    setClientPort,
    clientProtocol,
    setClientProtocol,
    enableReconnectRetry,
    setEnableReconnectRetry,
    applyJsonToForm,
    peerName,
    setPeerName,
    connectLocators,
    addConnectLocator,
    updateConnectLocator,
    removeConnectLocator,
    listenLocators,
    addListenLocator,
    updateListenLocator,
    removeListenLocator,
    scoutMulticast,
    setScoutMulticast,
    scoutGossip,
    setScoutGossip,
    routerName,
    setRouterName,
    routerListenEndpoints,
    addRouterListenEndpoint,
    updateRouterListenEndpoint,
    removeRouterListenEndpoint,
    routerScoutMulticast,
    setRouterScoutMulticast,
    routerScoutGossip,
    setRouterScoutGossip,
    routerConnectLocators,
    addRouterConnectLocator,
    updateRouterConnectLocator,
    removeRouterConnectLocator,
    username,
    setUsername,
    password,
    setPassword,
    token,
    setToken,
    enableTls,
    setEnableTls,
    useCustomTls,
    setUseCustomTls,
    tlsOnly,
    setTlsOnly,
    caCert,
    setCaCert,
    clientCert,
    setClientCert,
    clientKey,
    setClientKey,
    customConfigText,
    setCustomConfigText,
    generatedConfigJson,
    buildCurrentSessionConfig,
    validationError,
    testSuccessMessage,
    isSaving,
    isTesting,
    handleTestConnection,
    handleSave,
    // Backward-compatibility aliases
    cloudName: clientName,
    setCloudName: setClientName,
    cloudHost: clientHost,
    setCloudHost: setClientHost,
    cloudPort: clientPort,
    setCloudPort: setClientPort,
    cloudProtocol: clientProtocol,
    setCloudProtocol: setClientProtocol,
    localName: peerName,
    setLocalName: setPeerName,
  };
}


