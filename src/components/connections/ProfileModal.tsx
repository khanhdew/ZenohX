import React, { useState, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Network,
  Shield,
  FileCode,
  AlertCircle,
  Radio,
  Server,
  Zap,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { Badge } from '../ui/badge';
import { useConnectionStore } from '../../stores/connectionStore';
import type { ConnectionMode, ConnectionProfile } from '../../types/zenoh';

export interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile?: ConnectionProfile | null;
  onSaved?: (profile: ConnectionProfile) => void;
  onConnectAfterSave?: boolean;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  profile,
  onSaved,
}) => {
  const saveProfileToStore = useConnectionStore((state) => state.saveProfile);
  const connectSession = useConnectionStore((state) => state.connect);

  const isEditing = Boolean(profile?.id);

  // Form State
  const [name, setName] = useState<string>('');
  const [mode, setMode] = useState<ConnectionMode>('peer');
  const [connectLocators, setConnectLocators] = useState<string[]>([]);
  const [listenLocators, setListenLocators] = useState<string[]>([]);
  const [scoutMulticast, setScoutMulticast] = useState<boolean>(true);

  // Auth State
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [token, setToken] = useState<string>('');

  // TLS State
  const [caCert, setCaCert] = useState<string>('');
  const [clientCert, setClientCert] = useState<string>('');
  const [clientKey, setClientKey] = useState<string>('');

  // Custom JSON Config
  const [customConfigText, setCustomConfigText] = useState<string>('');

  // UI State
  const [activeTab, setActiveTab] = useState<string>('general');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Populate state whenever dialog opens or profile changes
  useEffect(() => {
    if (isOpen) {
      if (profile) {
        setName(profile.name || '');
        setMode((profile.mode as ConnectionMode) || 'peer');
        setConnectLocators(profile.connect_locators ? [...profile.connect_locators] : []);
        setListenLocators(profile.listen_locators ? [...profile.listen_locators] : []);
        setScoutMulticast(profile.scout_multicast ?? true);

        setUsername(profile.user_auth?.username || '');
        setPassword(profile.user_auth?.password || '');
        setToken(profile.user_auth?.token || '');

        setCaCert(profile.tls_config?.ca_cert || '');
        setClientCert(profile.tls_config?.client_cert || '');
        setClientKey(profile.tls_config?.client_key || '');

        if (profile.custom_config && Object.keys(profile.custom_config).length > 0) {
          setCustomConfigText(JSON.stringify(profile.custom_config, null, 2));
        } else {
          setCustomConfigText('');
        }
      } else {
        // Defaults for new connection profile
        setName('Local Peer');
        setMode('peer');
        setConnectLocators([]);
        setListenLocators([]);
        setScoutMulticast(true);
        setUsername('');
        setPassword('');
        setToken('');
        setCaCert('');
        setClientCert('');
        setClientKey('');
        setCustomConfigText('');
      }
      setValidationError(null);
      setActiveTab('general');
      setIsSaving(false);
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

  // Save handler
  const handleSave = async (andConnect: boolean = false) => {
    setValidationError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setValidationError('Connection Profile Name is required.');
      setActiveTab('general');
      return;
    }

    // Filter out blank locators
    const cleanConnectLocators = connectLocators
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    const cleanListenLocators = listenLocators
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    // Validate Custom Config JSON if provided
    let parsedCustomConfig: Record<string, unknown> | null = null;
    if (customConfigText.trim()) {
      try {
        parsedCustomConfig = JSON.parse(customConfigText.trim());
        if (typeof parsedCustomConfig !== 'object' || parsedCustomConfig === null || Array.isArray(parsedCustomConfig)) {
          setValidationError('Custom configuration must be a valid JSON object (e.g. { "key": "value" }).');
          setActiveTab('custom');
          return;
        }
      } catch (err) {
        setValidationError(`Invalid Custom JSON: ${(err as Error).message}`);
        setActiveTab('custom');
        return;
      }
    }

    // Build UserAuth
    const userAuth =
      username.trim() || password.trim() || token.trim()
        ? {
            username: username.trim() || undefined,
            password: password.trim() || undefined,
            token: token.trim() || undefined,
          }
        : null;

    // Build TlsConfig
    const tlsConfig =
      caCert.trim() || clientCert.trim() || clientKey.trim()
        ? {
            ca_cert: caCert.trim() || undefined,
            client_cert: clientCert.trim() || undefined,
            client_key: clientKey.trim() || undefined,
          }
        : null;

    const now = Date.now();
    const finalProfile: ConnectionProfile = {
      id: profile?.id || crypto.randomUUID(),
      name: trimmedName,
      mode,
      connect_locators: cleanConnectLocators,
      listen_locators: cleanListenLocators,
      scout_multicast: scoutMulticast,
      user_auth: userAuth,
      tls_config: tlsConfig,
      custom_config: parsedCustomConfig,
      created_at: profile?.created_at || now,
      updated_at: now,
    };

    setIsSaving(true);
    try {
      await saveProfileToStore(finalProfile);
      if (onSaved) {
        onSaved(finalProfile);
      }

      if (andConnect) {
        await connectSession(finalProfile.id);
      }

      setIsSaving(false);
      onClose();
    } catch (err) {
      setIsSaving(false);
      setValidationError(String(err));
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="p-5 pb-3 border-b bg-muted/20">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Network className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-lg">
                {isEditing ? 'Edit Connection Profile' : 'New Connection Profile'}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Configure Zenoh session endpoints, scouting, transport protocols, and authentication.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Validation Alert */}
        {validationError && (
          <div className="mx-5 mt-4 p-3 rounded-md bg-destructive/15 border border-destructive/30 flex items-start gap-2.5 text-xs text-destructive">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1 font-medium">{validationError}</div>
          </div>
        )}

        {/* Tab Navigation */}
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex-1 flex flex-col overflow-hidden"
        >
          <div className="px-5 pt-3 border-b bg-muted/10">
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="general" className="flex items-center gap-1.5 text-xs">
                <Network className="w-3.5 h-3.5" />
                Endpoints & Mode
              </TabsTrigger>
              <TabsTrigger value="security" className="flex items-center gap-1.5 text-xs">
                <Shield className="w-3.5 h-3.5" />
                Auth & Security
              </TabsTrigger>
              <TabsTrigger value="custom" className="flex items-center gap-1.5 text-xs">
                <FileCode className="w-3.5 h-3.5" />
                JSON Config
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Scrollable Tab Content */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {/* GENERAL TAB */}
            <TabsContent value="general" className="mt-0 space-y-5">
              {/* Profile Name */}
              <div className="space-y-1.5">
                <Label htmlFor="profile-name" className="text-xs font-semibold">
                  Profile Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="profile-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Local Zenoh Router, Cloud Peer"
                  className="h-9"
                />
              </div>

              {/* Mode Selection */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Zenoh Mode</Label>
                <div className="grid grid-cols-3 gap-3">
                  {/* Peer Mode */}
                  <div
                    onClick={() => {
                      setMode('peer');
                      if (connectLocators.length === 0 && !scoutMulticast) {
                        setScoutMulticast(true);
                      }
                    }}
                    className={`cursor-pointer rounded-lg border p-3 flex flex-col gap-1 transition-all ${
                      mode === 'peer'
                        ? 'border-primary bg-primary/5 ring-1 ring-primary'
                        : 'border-border hover:border-muted-foreground/40 hover:bg-muted/30'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5 text-blue-500" />
                        Peer
                      </span>
                      {mode === 'peer' && <Badge variant="default" className="text-[10px] h-4">Active</Badge>}
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      Decentralized P2P peer. Discovers neighbors via multicast or locators.
                    </span>
                  </div>

                  {/* Client Mode */}
                  <div
                    onClick={() => setMode('client')}
                    className={`cursor-pointer rounded-lg border p-3 flex flex-col gap-1 transition-all ${
                      mode === 'client'
                        ? 'border-primary bg-primary/5 ring-1 ring-primary'
                        : 'border-border hover:border-muted-foreground/40 hover:bg-muted/30'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold flex items-center gap-1.5">
                        <Radio className="w-3.5 h-3.5 text-emerald-500" />
                        Client
                      </span>
                      {mode === 'client' && <Badge variant="default" className="text-[10px] h-4">Active</Badge>}
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      Lightweight client. Connects to one or more Zenoh routers.
                    </span>
                  </div>

                  {/* Router Mode */}
                  <div
                    onClick={() => setMode('router')}
                    className={`cursor-pointer rounded-lg border p-3 flex flex-col gap-1 transition-all ${
                      mode === 'router'
                        ? 'border-primary bg-primary/5 ring-1 ring-primary'
                        : 'border-border hover:border-muted-foreground/40 hover:bg-muted/30'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold flex items-center gap-1.5">
                        <Server className="w-3.5 h-3.5 text-purple-500" />
                        Router
                      </span>
                      {mode === 'router' && <Badge variant="default" className="text-[10px] h-4">Active</Badge>}
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      Full router mode. Listens and routes traffic between peers and clients.
                    </span>
                  </div>
                </div>
              </div>

              {/* Multicast Scout Toggle */}
              <div className="rounded-lg border p-3 flex items-center justify-between bg-muted/20">
                <div className="space-y-0.5 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold">Multicast Scouting</span>
                    <Badge variant="info" className="text-[10px] h-4">LAN Discovery</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Automatically discover Zenoh routers and peers on the local subnet via UDP multicast (<code className="font-mono text-[10px]">224.0.0.224:7447</code>).
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={scoutMulticast}
                    onChange={(e) => setScoutMulticast(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>

              {/* Connect Locators */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-xs font-semibold">Connect Locators</Label>
                    <p className="text-[11px] text-muted-foreground">
                      Remote endpoints to connect to (e.g. <code className="font-mono text-[10px]">tcp/127.0.0.1:7447</code>, <code className="font-mono text-[10px]">udp/10.0.0.1:7447</code>, <code className="font-mono text-[10px]">tls/zenoh.corp:7447</code>).
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addConnectLocator}
                    className="h-7 px-2 text-xs gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    Add Locator
                  </Button>
                </div>

                {connectLocators.length === 0 ? (
                  <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
                    No connect locators specified. {mode === 'client' ? '(Client mode usually requires at least one router locator)' : '(Multicast scouting will be used if enabled)'}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {connectLocators.map((loc, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Input
                          value={loc}
                          onChange={(e) => updateConnectLocator(idx, e.target.value)}
                          placeholder="tcp/127.0.0.1:7447"
                          className="h-8 font-mono text-xs"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="iconSm"
                          onClick={() => removeConnectLocator(idx)}
                          className="text-muted-foreground hover:text-destructive h-8 w-8"
                          title="Remove Locator"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Listen Locators */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-xs font-semibold">Listen Locators</Label>
                    <p className="text-[11px] text-muted-foreground">
                      Local endpoints to bind and listen for incoming Zenoh connections (e.g. <code className="font-mono text-[10px]">tcp/0.0.0.0:7447</code>).
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addListenLocator}
                    className="h-7 px-2 text-xs gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    Add Listener
                  </Button>
                </div>

                {listenLocators.length === 0 ? (
                  <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
                    No listen locators specified. (Default ephemeral listeners will be assigned if required)
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {listenLocators.map((loc, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Input
                          value={loc}
                          onChange={(e) => updateListenLocator(idx, e.target.value)}
                          placeholder="tcp/0.0.0.0:7447"
                          className="h-8 font-mono text-xs"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="iconSm"
                          onClick={() => removeListenLocator(idx)}
                          className="text-muted-foreground hover:text-destructive h-8 w-8"
                          title="Remove Listener"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* SECURITY & AUTH TAB */}
            <TabsContent value="security" className="mt-0 space-y-5">
              {/* User Authentication */}
              <div className="space-y-3">
                <div className="flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-primary" />
                  <span className="text-xs font-semibold">User Credentials</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="auth-username" className="text-xs">Username</Label>
                    <Input
                      id="auth-username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="zenoh_user"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="auth-password" className="text-xs">Password</Label>
                    <Input
                      id="auth-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="auth-token" className="text-xs">Auth Token (Bearer / Secret)</Label>
                  <Input
                    id="auth-token"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="eyJhbGciOiJIUzI1NiIsIn..."
                    className="h-8 font-mono text-xs"
                  />
                </div>
              </div>

              <div className="border-t pt-4 space-y-3">
                <div className="flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-emerald-500" />
                  <span className="text-xs font-semibold">TLS / Certificate Configuration</span>
                </div>
                <div className="space-y-2.5">
                  <div className="space-y-1">
                    <Label htmlFor="tls-ca" className="text-xs">CA Certificate (File path or PEM string)</Label>
                    <Input
                      id="tls-ca"
                      value={caCert}
                      onChange={(e) => setCaCert(e.target.value)}
                      placeholder="/path/to/ca.crt"
                      className="h-8 font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="tls-client-cert" className="text-xs">Client Certificate</Label>
                    <Input
                      id="tls-client-cert"
                      value={clientCert}
                      onChange={(e) => setClientCert(e.target.value)}
                      placeholder="/path/to/client.crt"
                      className="h-8 font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="tls-client-key" className="text-xs">Client Private Key</Label>
                    <Input
                      id="tls-client-key"
                      value={clientKey}
                      onChange={(e) => setClientKey(e.target.value)}
                      placeholder="/path/to/client.key"
                      className="h-8 font-mono text-xs"
                    />
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* CUSTOM JSON5 TAB */}
            <TabsContent value="custom" className="mt-0 space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="custom-json" className="text-xs font-semibold">
                    Custom Zenoh JSON Configuration
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    Override underlying Zenoh session properties (e.g. transport, timestamping, routing).
                  </p>
                </div>
                {customConfigText.trim() && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      try {
                        const parsed = JSON.parse(customConfigText);
                        setCustomConfigText(JSON.stringify(parsed, null, 2));
                        setValidationError(null);
                      } catch (err) {
                        setValidationError(`Invalid JSON: ${(err as Error).message}`);
                      }
                    }}
                    className="h-7 text-xs"
                  >
                    Format JSON
                  </Button>
                )}
              </div>
              <textarea
                id="custom-json"
                rows={10}
                value={customConfigText}
                onChange={(e) => setCustomConfigText(e.target.value)}
                placeholder={`{\n  "transport": {\n    "unicast": {\n      "max_links": 2\n    }\n  }\n}`}
                className="w-full rounded-md border border-input bg-transparent p-3 font-mono text-xs leading-relaxed shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </TabsContent>
          </div>
        </Tabs>

        {/* Footer Actions */}
        <DialogFooter className="p-4 border-t bg-muted/20 gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSaving}
            className="text-xs h-9"
          >
            Cancel
          </Button>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleSave(true)}
              disabled={isSaving}
              className="text-xs h-9"
            >
              Save & Connect
            </Button>
            <Button
              type="button"
              variant="default"
              onClick={() => handleSave(false)}
              disabled={isSaving}
              className="text-xs h-9"
            >
              {isSaving ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Profile'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ProfileModal;
