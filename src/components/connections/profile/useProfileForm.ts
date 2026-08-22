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
  type ConnectionPreset,
} from '../../../lib/tls';

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

  // Preset Selection
  const [preset, setPreset] = useState<ConnectionPreset>('cloud');
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

  // Simplified Cloud Form State
  const [cloudName, setCloudName] = useState<string>('Cloud Router');
  const [cloudHost, setCloudHost] = useState<string>('');
  const [cloudPort, setCloudPort] = useState<string>('7447');
  const [cloudProtocol, setCloudProtocol] = useState<'tls' | 'tcp' | 'quic' | 'udp'>('tls');

  // Simplified Local Form State
  const [localName, setLocalName] = useState<string>('Local Peer');

  // Advanced / Raw Form State
  const [name, setName] = useState<string>('');
  const [mode, setMode] = useState<ConnectionMode>('client');
  const [connectLocators, setConnectLocators] = useState<string[]>([]);
  const [listenLocators, setListenLocators] = useState<string[]>([]);
  const [scoutMulticast, setScoutMulticast] = useState<boolean>(false);

  // Auth State
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [token, setToken] = useState<string>('');

  // TLS State
  const [enableTls, setEnableTls] = useState<boolean>(true);
  const [useCustomTls, setUseCustomTls] = useState<boolean>(false);
  const [caCert, setCaCert] = useState<string>('');
  const [clientCert, setClientCert] = useState<string>('');
  const [clientKey, setClientKey] = useState<string>('');

  // Custom JSON Config
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
        setShowAdvanced(detected === 'custom');

        setName(profile.name || '');
        setMode((profile.mode as ConnectionMode) || 'peer');
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
        setCaCert(profile.tls_config?.ca_cert || '');
        setClientCert(profile.tls_config?.client_cert || '');
        setClientKey(profile.tls_config?.client_key || '');

        // Populate simplified cloud form if locator exists
        if (profile.connect_locators && profile.connect_locators.length === 1) {
          const parsed = parseLocator(profile.connect_locators[0]);
          if (parsed) {
            setCloudHost(parsed.host);
            setCloudPort(parsed.port);
            setCloudProtocol((parsed.protocol as 'tls' | 'tcp' | 'quic' | 'udp') || 'tls');
          } else {
            setCloudHost('');
            setCloudPort('7447');
            setCloudProtocol('tls');
          }
        } else {
          setCloudHost('');
          setCloudPort('7447');
          setCloudProtocol(isTlsOn ? 'tls' : 'tcp');
        }

        setCloudName(profile.name || 'Cloud Router');
        setLocalName(profile.name || 'Local Peer');

        if (profile.custom_config && Object.keys(profile.custom_config).length > 0) {
          setCustomConfigText(JSON.stringify(profile.custom_config, null, 2));
        } else {
          setCustomConfigText('');
        }
      } else {
        // Defaults for new connection profile
        setPreset('cloud');
        setShowAdvanced(false);

        setCloudName('Cloud Router');
        setCloudHost('');
        setCloudPort('7447');
        setCloudProtocol('tls');

        setLocalName('Local Peer');

        setName('Custom Profile');
        setMode('client');
        setConnectLocators([]);
        setListenLocators([]);
        setScoutMulticast(false);
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

  // Connect Locators Helpers
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

  // Listen Locators Helpers
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

  // Validation
  const validate = (): boolean => {
    if (preset === 'cloud') {
      if (!cloudName.trim()) {
        setValidationError('Profile Name is required.');
        return false;
      }
      if (!cloudHost.trim()) {
        setValidationError('Cloud / Remote Server Address is required (e.g. router.zenoh.io).');
        return false;
      }
    } else if (preset === 'local') {
      if (!localName.trim()) {
        setValidationError('Profile Name is required.');
        return false;
      }
    } else {
      if (!name.trim()) {
        setValidationError('Profile Name is required.');
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

    if (preset === 'cloud') {
      const locator = buildLocator(cloudProtocol, cloudHost, cloudPort);
      const tlsConfig = resolveTlsConfig({
        enableTls: cloudProtocol === 'tls',
        useCustomTls,
        caCert,
        clientCert,
        clientKey,
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
    } else if (preset === 'local') {
      return {
        mode: 'peer',
        connect_locators: [],
        listen_locators: [],
        scout_multicast: true,
        user_auth: null,
        tls_config: null,
        custom_config: customConfigObj,
      };
    } else {
      const filteredConnect = connectLocators.map((l) => l.trim()).filter(Boolean);
      const filteredListen = listenLocators.map((l) => l.trim()).filter(Boolean);
      const tlsConfig = resolveTlsConfig({
        enableTls,
        useCustomTls,
        caCert,
        clientCert,
        clientKey,
      });
      return {
        mode,
        connect_locators: filteredConnect,
        listen_locators: filteredListen,
        scout_multicast: scoutMulticast,
        user_auth: userAuth,
        tls_config: tlsConfig,
        custom_config: customConfigObj,
      };
    }
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
        setValidationError(`Connection Test Failed: ${res.message}`);
      }
    } catch (err) {
      setIsTesting(false);
      setValidationError(`Connection Test Failed: ${err instanceof Error ? err.message : String(err)}`);
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

      let finalName = name.trim();
      let finalMode: string = mode;
      let finalConnectLocators: string[] = [];
      let finalListenLocators: string[] = [];
      let finalScoutMulticast = scoutMulticast;
      let finalTlsConfig = resolveTlsConfig({
        enableTls,
        useCustomTls,
        caCert,
        clientCert,
        clientKey,
      });

      if (preset === 'cloud') {
        finalName = cloudName.trim();
        finalMode = 'client';
        finalScoutMulticast = false;
        const locator = buildLocator(cloudProtocol, cloudHost, cloudPort);
        finalConnectLocators = locator ? [locator] : [];
        finalListenLocators = [];
        finalTlsConfig = resolveTlsConfig({
          enableTls: cloudProtocol === 'tls',
          useCustomTls,
          caCert,
          clientCert,
          clientKey,
        });
      } else if (preset === 'local') {
        finalName = localName.trim();
        finalMode = 'peer';
        finalScoutMulticast = true;
        finalConnectLocators = [];
        finalListenLocators = [];
        finalTlsConfig = null;
      } else {
        finalConnectLocators = connectLocators.map((l) => l.trim()).filter(Boolean);
        finalListenLocators = listenLocators.map((l) => l.trim()).filter(Boolean);
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
      setValidationError(err instanceof Error ? err.message : String(err));
    }
  };

  return {
    isEditing,
    preset,
    setPreset,
    showAdvanced,
    setShowAdvanced,
    cloudName,
    setCloudName,
    cloudHost,
    setCloudHost,
    cloudPort,
    setCloudPort,
    cloudProtocol,
    setCloudProtocol,
    localName,
    setLocalName,
    name,
    setName,
    mode,
    setMode,
    connectLocators,
    listenLocators,
    scoutMulticast,
    setScoutMulticast,
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
    addConnectLocator,
    updateConnectLocator,
    removeConnectLocator,
    addListenLocator,
    updateListenLocator,
    removeListenLocator,
    handleTestConnection,
    handleSave,
  };
}
