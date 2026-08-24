import { useState, useEffect } from 'react';
import { useConnectionStore } from '../../../stores/connectionStore';
import type { ConnectionMode, ConnectionProfile, SessionConfig } from '../../../types/zenoh';
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

  // Peer Mode Form State
  const [peerName, setPeerName] = useState<string>('Local Peer');
  const [connectLocators, setConnectLocators] = useState<string[]>([]);
  const [listenLocators, setListenLocators] = useState<string[]>([]);
  const [scoutMulticast, setScoutMulticast] = useState<boolean>(true);

  // Router Mode Form State
  const [routerName, setRouterName] = useState<string>('Local Router');
  const [routerListenEndpoints, setRouterListenEndpoints] = useState<RouterListenEndpoint[]>([
    { id: 'ep-1', protocol: 'tcp', host: '0.0.0.0', port: '7447' },
  ]);
  const [routerScoutMulticast, setRouterScoutMulticast] = useState<boolean>(true);
  const [routerConnectLocators, setRouterConnectLocators] = useState<string[]>([]);

  // Auth State
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [token, setToken] = useState<string>('');

  // TLS State
  const [enableTls, setEnableTls] = useState<boolean>(true);
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
              port: parsed?.port || '7447',
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

        setPeerName('Local Peer');
        setConnectLocators([]);
        setListenLocators([]);
        setScoutMulticast(true);

        const suggestedPort = getSuggestedRouterPort(useConnectionStore.getState().profiles);
        setRouterName('Local Router');
        setRouterListenEndpoints([
          { id: `ep-1`, protocol: 'tcp', host: '0.0.0.0', port: suggestedPort },
        ]);
        setRouterScoutMulticast(true);
        setRouterConnectLocators([]);

        setUsername('');
        setPassword('');
        setToken('');
        setEnableTls(true);
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
      if (!clientHost.trim()) {
        setValidationError('Router Address is required (e.g. 127.0.0.1 or router.zenoh.io).');
        return false;
      }
    } else if (preset === 'peer') {
      if (!peerName.trim()) {
        setValidationError('Profile Name is required.');
        return false;
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
      if (routerListenEndpoints.some((ep) => !ep.port.trim())) {
        setValidationError('Listen Port is required for all endpoints (use 0 for auto).');
        return false;
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

  const buildCurrentSessionConfig = (): SessionConfig => {
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

    if (preset === 'client') {
      const locator = buildLocator(clientProtocol, clientHost, clientPort);
      const tlsConfig = resolveTlsConfig({
        enableTls: clientProtocol === 'tls',
        useCustomTls,
        caCert,
        clientCert,
        clientKey,
        tlsOnly,
      });
      return {
        mode: 'client',
        connect_locators: locator ? [locator] : [],
        listen_locators: [],
        scout_multicast: false,
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
      return {
        mode: 'peer',
        connect_locators: connectLocators.map((l) => l.trim()).filter(Boolean),
        listen_locators: [],
        scout_multicast: scoutMulticast,
        user_auth: null,
        tls_config: tlsConfig,
        custom_config: customConfigObj,
      };
    } else if (preset === 'router') {
      const listenLocs = routerListenEndpoints
        .map((ep) => buildLocator(ep.protocol, ep.host.trim() || '0.0.0.0', ep.port.trim() || '7447'))
        .filter(Boolean);
      const hasTlsEndpoint = routerListenEndpoints.some((ep) => ep.protocol === 'tls');
      const tlsConfig = resolveTlsConfig({
        enableTls: hasTlsEndpoint || enableTls || useCustomTls,
        useCustomTls,
        caCert,
        clientCert,
        clientKey,
        tlsOnly,
      });
      return {
        mode: 'router',
        connect_locators: routerConnectLocators.map((l) => l.trim()).filter(Boolean),
        listen_locators: listenLocs.length > 0 ? listenLocs : ['tcp/0.0.0.0:7447'],
        scout_multicast: routerScoutMulticast,
        user_auth: userAuth,
        tls_config: tlsConfig,
        custom_config: customConfigObj,
      };
    }

    return {
      mode: 'client',
      connect_locators: [],
      listen_locators: [],
      scout_multicast: false,
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

      let finalName = '';
      let finalMode: ConnectionMode = 'client';
      let finalConnectLocators: string[] = [];
      let finalListenLocators: string[] = [];
      let finalScoutMulticast = false;
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
        const locator = buildLocator(clientProtocol, clientHost, clientPort);
        finalConnectLocators = locator ? [locator] : [];
        finalListenLocators = [];
        finalTlsConfig = resolveTlsConfig({
          enableTls: clientProtocol === 'tls',
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
        const listenLocs = routerListenEndpoints
          .map((ep) => buildLocator(ep.protocol, ep.host.trim() || '0.0.0.0', ep.port.trim() || '7447'))
          .filter(Boolean);
        finalListenLocators = listenLocs.length > 0 ? listenLocs : ['tcp/0.0.0.0:7447'];
        finalConnectLocators = routerConnectLocators.map((l) => l.trim()).filter(Boolean);
        const hasTlsEndpoint = routerListenEndpoints.some((ep) => ep.protocol === 'tls');
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
    peerName,
    setPeerName,
    connectLocators,
    addConnectLocator,
    updateConnectLocator,
    removeConnectLocator,
    routerName,
    setRouterName,
    routerListenEndpoints,
    addRouterListenEndpoint,
    updateRouterListenEndpoint,
    removeRouterListenEndpoint,
    routerScoutMulticast,
    setRouterScoutMulticast,
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


