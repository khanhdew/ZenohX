import React, { useEffect } from 'react';
import {
  AlertCircle,
  X,
  PanelRight,
  ChevronDown,
  ChevronUp,
  Activity,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import type { ConnectionProfile } from '../../types/zenoh';
import { useProfileForm } from './profile/useProfileForm';
import { PresetSelector } from './profile/PresetSelector';
import { ClientConfigForm } from './profile/ClientConfigForm';
import { PeerConfigForm } from './profile/PeerConfigForm';
import { RouterConfigForm } from './profile/RouterConfigForm';
import { TlsConfigSection } from './profile/TlsConfigSection';
import { MeshRoutingSection } from './profile/MeshRoutingSection';
import { RawJsonConfigSection } from './profile/RawJsonConfigSection';

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
  const form = useProfileForm({
    isOpen,
    profile,
    onClose,
    onSaved,
  });

  // Keyboard shortcut: Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Dimmed Backdrop (Click to dismiss) */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-40 animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over Side Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={form.isEditing ? 'Edit Connection Profile' : 'New Connection Profile'}
        className="fixed inset-y-0 right-0 z-50 w-full max-w-lg md:max-w-xl bg-card border-l shadow-2xl flex flex-col animate-in slide-in-from-right duration-250 ease-out"
      >
        {/* Panel Header */}
        <div className="p-4 border-b bg-muted/20 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-muted/60 text-foreground">
              <PanelRight className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                {form.isEditing ? 'Edit Connection' : 'New Connection'}
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Connect to a Zenoh cloud router, join a peer mesh, or run a local router.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] uppercase font-mono">
              Zenoh 1.10.0
            </Badge>
            <Button
              type="button"
              variant="ghost"
              size="iconSm"
              onClick={onClose}
              className="h-7 w-7 text-muted-foreground hover:text-foreground rounded-md"
              title="Close panel (Esc)"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Validation / Connection Error Notice */}
        {form.validationError && (
          <div className="mx-4 mt-3 p-2.5 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2 shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="flex-1">{form.validationError}</span>
          </div>
        )}

        {/* Test Connection Success Message */}
        {form.testSuccessMessage && (
          <div className="mx-4 mt-3 p-2.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2 shrink-0">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span className="flex-1 font-medium">{form.testSuccessMessage}</span>
          </div>
        )}

        {/* Scrollable Sheet Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Preset Selector */}
          <PresetSelector
            preset={form.preset}
            onSelectPreset={(p) => {
              form.setPreset(p);
            }}
          />

          {/* Form Content Based on Preset */}
          {form.preset === 'client' && (
            <ClientConfigForm
              clientName={form.clientName}
              setClientName={form.setClientName}
              clientHost={form.clientHost}
              setClientHost={form.setClientHost}
              clientPort={form.clientPort}
              setClientPort={form.setClientPort}
              clientProtocol={form.clientProtocol}
              setClientProtocol={form.setClientProtocol}
              tlsOnly={form.tlsOnly}
              setTlsOnly={form.setTlsOnly}
              enableReconnectRetry={form.enableReconnectRetry}
              setEnableReconnectRetry={form.setEnableReconnectRetry}
              username={form.username}
              setUsername={form.setUsername}
              password={form.password}
              setPassword={form.setPassword}
            />
          )}

          {form.preset === 'peer' && (
            <PeerConfigForm
              peerName={form.peerName}
              setPeerName={form.setPeerName}
              connectLocators={form.connectLocators}
              addConnectLocator={form.addConnectLocator}
              updateConnectLocator={form.updateConnectLocator}
              removeConnectLocator={form.removeConnectLocator}
              listenLocators={form.listenLocators}
              addListenLocator={form.addListenLocator}
              updateListenLocator={form.updateListenLocator}
              removeListenLocator={form.removeListenLocator}
              scoutMulticast={form.scoutMulticast}
              setScoutMulticast={form.setScoutMulticast}
              scoutGossip={form.scoutGossip}
              setScoutGossip={form.setScoutGossip}
              enableTls={form.enableTls}
              setEnableTls={form.setEnableTls}
              useCustomTls={form.useCustomTls}
              setUseCustomTls={form.setUseCustomTls}
              tlsOnly={form.tlsOnly}
              setTlsOnly={form.setTlsOnly}
              caCert={form.caCert}
              setCaCert={form.setCaCert}
              clientCert={form.clientCert}
              setClientCert={form.setClientCert}
              clientKey={form.clientKey}
              setClientKey={form.setClientKey}
            />
          )}

          {form.preset === 'router' && (
            <RouterConfigForm
              routerName={form.routerName}
              setRouterName={form.setRouterName}
              listenEndpoints={form.routerListenEndpoints}
              addListenEndpoint={form.addRouterListenEndpoint}
              updateListenEndpoint={form.updateRouterListenEndpoint}
              removeListenEndpoint={form.removeRouterListenEndpoint}
              routerScoutMulticast={form.routerScoutMulticast}
              setRouterScoutMulticast={form.setRouterScoutMulticast}
              routerScoutGossip={form.routerScoutGossip}
              setRouterScoutGossip={form.setRouterScoutGossip}
              routerConnectLocators={form.routerConnectLocators}
              addRouterConnectLocator={form.addRouterConnectLocator}
              updateRouterConnectLocator={form.updateRouterConnectLocator}
              removeRouterConnectLocator={form.removeRouterConnectLocator}
            />
          )}

          {/* Toggle for Advanced Settings Accordion */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => form.setShowAdvanced(!form.showAdvanced)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground font-medium transition-colors"
            >
              {form.showAdvanced ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
              {form.showAdvanced ? 'Hide Advanced Settings' : 'Show Advanced Settings (Mesh, mTLS, JSON5)'}
            </button>
          </div>

          {/* Advanced Settings Body */}
          {form.showAdvanced && (
            <div className="space-y-5 pt-2 border-t animate-in fade-in duration-200">
              {/* Mesh Routing & Discovery Policy Card */}
              <MeshRoutingSection
                scoutMulticast={form.preset === 'router' ? form.routerScoutMulticast : form.scoutMulticast}
                setScoutMulticast={form.preset === 'router' ? form.setRouterScoutMulticast : form.setScoutMulticast}
                scoutGossip={form.preset === 'router' ? form.routerScoutGossip : form.scoutGossip}
                setScoutGossip={form.preset === 'router' ? form.setRouterScoutGossip : form.setScoutGossip}
                autoReconnect={form.enableReconnectRetry}
                setAutoReconnect={form.setEnableReconnectRetry}
              />

              {/* Custom TLS / Certificates (mTLS) Card */}
              <TlsConfigSection
                useCustomTls={form.useCustomTls}
                setUseCustomTls={form.setUseCustomTls}
                tlsOnly={form.tlsOnly}
                setTlsOnly={form.setTlsOnly}
                caCert={form.caCert}
                setCaCert={form.setCaCert}
                clientCert={form.clientCert}
                setClientCert={form.setClientCert}
                clientKey={form.clientKey}
                setClientKey={form.setClientKey}
              />

              {/* Custom JSON Overrides & Live JSON5 Preview */}
              <RawJsonConfigSection
                customConfigText={form.customConfigText}
                setCustomConfigText={form.setCustomConfigText}
                generatedConfigJson={form.generatedConfigJson}
              />
            </div>
          )}
        </div>

        {/* Panel Footer */}
        <div className="p-3.5 border-t bg-muted/20 flex items-center justify-between gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={form.handleTestConnection}
            disabled={form.isSaving || form.isTesting}
            className="h-8 text-xs gap-1.5"
            title="Test connection without saving"
          >
            {form.isTesting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Activity className="w-3.5 h-3.5 text-muted-foreground" />
            )}
            {form.isTesting ? 'Testing...' : 'Test Connection'}
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={form.isSaving || form.isTesting}
              className="h-8 text-xs"
            >
              Cancel
            </Button>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => form.handleSave(false)}
              disabled={form.isSaving || form.isTesting}
              className="h-8 text-xs font-medium"
            >
              Save Profile
            </Button>

            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => form.handleSave(true)}
              disabled={form.isSaving || form.isTesting}
              className="h-8 text-xs font-medium gap-1.5"
            >
              {form.isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {form.isSaving ? 'Connecting...' : 'Save & Connect'}
            </Button>
          </div>
        </div>
      </aside>
    </>
  );
};

export default ProfileModal;
