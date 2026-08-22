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

  // Validation
  const validate = (): boolean => {
    if (!name.trim()) {
      setValidationError('Profile name is required.');
      setActiveTab('general');
      return false;
    }

    if (customConfigText.trim()) {
      try {
        const parsed = JSON.parse(customConfigText);
        if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) {
          setValidationError('Custom configuration must be a valid JSON object (key-value dictionary).');
          setActiveTab('advanced');
          return false;
        }
      } catch (err) {
        setValidationError(`Invalid JSON in custom configuration: ${(err as Error).message}`);
        setActiveTab('advanced');
        return false;
      }
    }

    setValidationError(null);
    return true;
  };

  // Save handler
  const handleSave = async (andConnect: boolean = false) => {
    if (!validate()) return;

    setIsSaving(true);
    try {
      let customConfigObj: Record<string, unknown> | null = null;
      if (customConfigText.trim()) {
        customConfigObj = JSON.parse(customConfigText);
      }

      const filteredConnect = connectLocators.map((l) => l.trim()).filter(Boolean);
      const filteredListen = listenLocators.map((l) => l.trim()).filter(Boolean);

      const userAuth =
        username.trim() || password.trim() || token.trim()
          ? {
              username: username.trim() || undefined,
              password: password.trim() || undefined,
              token: token.trim() || undefined,
            }
          : null;

      const tlsConfig =
        caCert.trim() || clientCert.trim() || clientKey.trim()
          ? {
              ca_cert: caCert.trim() || undefined,
              client_cert: clientCert.trim() || undefined,
              client_key: clientKey.trim() || undefined,
            }
          : null;

      const now = Date.now();
      const updatedProfile: ConnectionProfile = {
        id: profile?.id || crypto.randomUUID(),
        name: name.trim(),
        mode,
        connect_locators: filteredConnect,
        listen_locators: filteredListen,
        scout_multicast: scoutMulticast,
        user_auth: userAuth,
        tls_config: tlsConfig,
        custom_config: customConfigObj,
        created_at: profile?.created_at || now,
        updated_at: now,
      };

      await saveProfileToStore(updatedProfile);

      if (onSaved) {
        onSaved(updatedProfile);
      }

      if (andConnect) {
        await connectSession(updatedProfile.id);
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
      <DialogContent className="max-w-xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Modal Header */}
        <DialogHeader className="p-4 border-b bg-muted/20">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-base font-semibold">
                {isEditing ? 'Edit Connection Profile' : 'New Connection Profile'}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Configure endpoint locators, transport mode, authentication, and TLS.
              </DialogDescription>
            </div>
            <Badge variant="outline" className="text-xs uppercase font-mono">
              Zenoh 1.10.0
            </Badge>
          </div>
        </DialogHeader>

        {/* Validation Error Notice */}
        {validationError && (
          <div className="mx-4 mt-3 p-2.5 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="flex-1">{validationError}</span>
          </div>
        )}

        {/* Modal Tabs Body */}
        <div className="flex-1 overflow-y-auto p-4">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid grid-cols-4 w-full h-8 mb-4 bg-muted">
              <TabsTrigger value="general" className="text-xs">
                General
              </TabsTrigger>
              <TabsTrigger value="network" className="text-xs">
                Network
              </TabsTrigger>
              <TabsTrigger value="security" className="text-xs">
                Security
              </TabsTrigger>
              <TabsTrigger value="advanced" className="text-xs">
                JSON Config
              </TabsTrigger>
            </TabsList>

            {/* Tab 1: General Settings */}
            <TabsContent value="general" className="space-y-4 m-0">
              {/* Profile Name */}
              <div className="space-y-1">
                <Label htmlFor="prof-name" className="text-xs font-semibold">
                  Profile Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="prof-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Production Router, Local Peer"
                  className="h-8 text-xs bg-background"
                />
              </div>

              {/* Mode Selection */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Zenoh Operating Mode</Label>
                <div className="grid grid-cols-3 gap-2">
                  {/* Peer Mode */}
                  <div
                    onClick={() => setMode('peer')}
                    className={`cursor-pointer rounded-md border p-2.5 flex flex-col gap-1 transition-colors ${
                      mode === 'peer'
                        ? 'border-foreground/30 bg-muted/60'
                        : 'border-border hover:bg-muted/40'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5 text-muted-foreground" />
                        Peer
                      </span>
                      {mode === 'peer' && <Badge variant="secondary" className="text-[10px] h-4">Active</Badge>}
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      P2P peer. Discovers neighbors via multicast or locators.
                    </span>
                  </div>

                  {/* Client Mode */}
                  <div
                    onClick={() => setMode('client')}
                    className={`cursor-pointer rounded-md border p-2.5 flex flex-col gap-1 transition-colors ${
                      mode === 'client'
                        ? 'border-foreground/30 bg-muted/60'
                        : 'border-border hover:bg-muted/40'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold flex items-center gap-1.5">
                        <Radio className="w-3.5 h-3.5 text-muted-foreground" />
                        Client
                      </span>
                      {mode === 'client' && <Badge variant="secondary" className="text-[10px] h-4">Active</Badge>}
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      Client mode. Connects to one or more Zenoh routers.
                    </span>
                  </div>

                  {/* Router Mode */}
                  <div
                    onClick={() => setMode('router')}
                    className={`cursor-pointer rounded-md border p-2.5 flex flex-col gap-1 transition-colors ${
                      mode === 'router'
                        ? 'border-foreground/30 bg-muted/60'
                        : 'border-border hover:bg-muted/40'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold flex items-center gap-1.5">
                        <Server className="w-3.5 h-3.5 text-muted-foreground" />
                        Router
                      </span>
                      {mode === 'router' && <Badge variant="secondary" className="text-[10px] h-4">Active</Badge>}
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      Router mode. Listens and routes traffic across nodes.
                    </span>
                  </div>
                </div>
              </div>

              {/* Multicast Scout Toggle */}
              <div className="rounded-md border p-2.5 flex items-center justify-between bg-muted/20">
                <div className="space-y-0.5 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold">Multicast Scouting</span>
                    <Badge variant="outline" className="text-[10px] h-4">LAN</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Discover Zenoh routers and peers on the local subnet via UDP multicast (<code className="font-mono text-[10px]">224.0.0.224:7447</code>).
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={scoutMulticast}
                  onChange={(e) => setScoutMulticast(e.target.checked)}
                  className="rounded border-input text-primary focus:ring-ring h-4 w-4"
                />
              </div>

              {/* Connect Locators */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-xs font-semibold">Connect Locators</Label>
                    <p className="text-[11px] text-muted-foreground">
                      Endpoints to connect to (e.g. <code className="font-mono text-[10px]">tcp/127.0.0.1:7447</code>, <code className="font-mono text-[10px]">udp/10.0.0.1:7447</code>).
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addConnectLocator}
                    className="h-6 px-2 text-xs gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    Add
                  </Button>
                </div>

                {connectLocators.length === 0 ? (
                  <div className="rounded-md border border-dashed p-2.5 text-center text-xs text-muted-foreground">
                    No connect locators specified.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {connectLocators.map((loc, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Input
                          value={loc}
                          onChange={(e) => updateConnectLocator(idx, e.target.value)}
                          placeholder="tcp/127.0.0.1:7447"
                          className="h-7 font-mono text-xs bg-background"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="iconSm"
                          onClick={() => removeConnectLocator(idx)}
                          className="text-muted-foreground hover:text-destructive h-7 w-7"
                          title="Remove Locator"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Tab 2: Network & Listen Settings */}
            <TabsContent value="network" className="space-y-4 m-0">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-xs font-semibold">Listen Locators</Label>
                    <p className="text-[11px] text-muted-foreground">
                      Endpoints this session will bind and listen on for inbound connections.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addListenLocator}
                    className="h-6 px-2 text-xs gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    Add
                  </Button>
                </div>

                {listenLocators.length === 0 ? (
                  <div className="rounded-md border border-dashed p-2.5 text-center text-xs text-muted-foreground">
                    No listen locators configured.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {listenLocators.map((loc, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Input
                          value={loc}
                          onChange={(e) => updateListenLocator(idx, e.target.value)}
                          placeholder="tcp/0.0.0.0:7447"
                          className="h-7 font-mono text-xs bg-background"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="iconSm"
                          onClick={() => removeListenLocator(idx)}
                          className="text-muted-foreground hover:text-destructive h-7 w-7"
                          title="Remove Listen Locator"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Tab 3: Security Settings (Auth & TLS) */}
            <TabsContent value="security" className="space-y-4 m-0">
              {/* User Authentication */}
              <div className="space-y-2.5 border rounded-md p-3 bg-muted/10">
                <span className="text-xs font-semibold flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-muted-foreground" />
                  User Authentication
                </span>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[11px] font-medium text-muted-foreground">Username</Label>
                    <Input
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="zenoh_user"
                      className="h-7 text-xs bg-background"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] font-medium text-muted-foreground">Password</Label>
                    <Input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="h-7 text-xs bg-background"
                    />
                  </div>
                </div>

                <div className="space-y-1 pt-1">
                  <Label className="text-[11px] font-medium text-muted-foreground">Token / Key (Optional)</Label>
                  <Input
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="Bearer token or API secret"
                    className="h-7 text-xs font-mono bg-background"
                  />
                </div>
              </div>

              {/* TLS Configuration */}
              <div className="space-y-2.5 border rounded-md p-3 bg-muted/10">
                <span className="text-xs font-semibold flex items-center gap-1.5">
                  <Network className="w-3.5 h-3.5 text-muted-foreground" />
                  TLS / SSL Encryption
                </span>

                <div className="space-y-2">
                  <div className="space-y-1">
                    <Label className="text-[11px] font-medium text-muted-foreground">CA Certificate Path</Label>
                    <Input
                      value={caCert}
                      onChange={(e) => setCaCert(e.target.value)}
                      placeholder="/path/to/ca.pem"
                      className="h-7 font-mono text-xs bg-background"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[11px] font-medium text-muted-foreground">Client Cert Path</Label>
                      <Input
                        value={clientCert}
                        onChange={(e) => setClientCert(e.target.value)}
                        placeholder="/path/to/client.crt"
                        className="h-7 font-mono text-xs bg-background"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] font-medium text-muted-foreground">Client Key Path</Label>
                      <Input
                        value={clientKey}
                        onChange={(e) => setClientKey(e.target.value)}
                        placeholder="/path/to/client.key"
                        className="h-7 font-mono text-xs bg-background"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Tab 4: Advanced Custom JSON Config */}
            <TabsContent value="advanced" className="space-y-3 m-0">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold flex items-center gap-1.5">
                    <FileCode className="w-3.5 h-3.5 text-muted-foreground" />
                    Custom JSON Overrides
                  </Label>
                  <span className="text-[10px] text-muted-foreground">
                    Deep Zenoh configuration dictionary
                  </span>
                </div>
                <textarea
                  value={customConfigText}
                  onChange={(e) => setCustomConfigText(e.target.value)}
                  placeholder={`{\n  "transport": {\n    "unicast": {\n      "max_sessions": 100\n    }\n  }\n}`}
                  rows={8}
                  className="w-full font-mono text-xs rounded-md border border-input bg-background p-2.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Modal Footer */}
        <DialogFooter className="p-3 border-t bg-muted/20 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isSaving}
            className="h-8 text-xs"
          >
            Cancel
          </Button>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => handleSave(false)}
            disabled={isSaving}
            className="h-8 text-xs font-medium"
          >
            Save Profile
          </Button>

          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={() => handleSave(true)}
            disabled={isSaving}
            className="h-8 text-xs font-medium"
          >
            Save & Connect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ProfileModal;
