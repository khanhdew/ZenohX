import { useEffect, useState } from 'react';
import {
  Radio,
  Search,
  History,
  Radar,
  Plus,
  Power,
  PowerOff,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  Zap,
  AlertTriangle,
  X,
} from 'lucide-react';
import { useConnectionStore } from './stores/connectionStore';
import { useMessageStore } from './stores/messageStore';
import { useQueryStore } from './stores/queryStore';
import { ConnectionProfile } from './types/zenoh';
import { Sidebar } from './components/connections/Sidebar';
import { ProfileModal } from './components/connections/ProfileModal';
import { ScoutModal } from './components/connections/ScoutModal';
import { PubSubWorkspace } from './components/pubsub/PubSubWorkspace';
import { QueryWorkspace } from './components/query/QueryWorkspace';
import { SettingsWorkspace } from './components/settings/SettingsWorkspace';
import { Button } from './components/ui/button';
import { Badge } from './components/ui/badge';

export function App() {
  const [activeTab, setActiveTab] = useState<'pubsub' | 'query' | 'settings'>('pubsub');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<ConnectionProfile | null>(null);
  const [scoutModalOpen, setScoutModalOpen] = useState(false);

  // Connection store state
  const profiles = useConnectionStore((s) => s.profiles);
  const selectedProfileId = useConnectionStore((s) => s.selectedProfileId);
  const activeSessions = useConnectionStore((s) => s.activeSessions);
  const connectingProfileIds = useConnectionStore((s) => s.connectingProfileIds);
  const loadProfiles = useConnectionStore((s) => s.loadProfiles);
  const selectProfile = useConnectionStore((s) => s.selectProfile);
  const connect = useConnectionStore((s) => s.connect);
  const disconnect = useConnectionStore((s) => s.disconnect);
  const connectionError = useConnectionStore((s) => s.error);
  const setConnectionError = useConnectionStore((s) => s.setError);

  // Message & Query store states for badges
  const subscriptions = useMessageStore((s) => s.subscriptions);
  const pubsubError = useMessageStore((s) => s.error);
  const setPubsubError = useMessageStore((s) => s.setError);

  const inboundQueries = useQueryStore((s) => s.inboundQueries);
  const queryError = useQueryStore((s) => s.error);
  const setQueryError = useQueryStore((s) => s.setError);

  const selectedProfile = profiles.find((p) => p.id === selectedProfileId) || null;
  const isConnected = Boolean(selectedProfileId && activeSessions[selectedProfileId]);
  const isConnecting = Boolean(selectedProfileId && connectingProfileIds[selectedProfileId]);

  const activeSubsCount = selectedProfileId
    ? subscriptions.filter((s) => s.active && (!s.profileId || s.profileId === selectedProfileId)).length
    : 0;

  const pendingInboundCount = selectedProfileId
    ? inboundQueries.filter((q) => !q.session_id || q.session_id === activeSessions[selectedProfileId]?.id).length
    : 0;

  // Global error message
  const activeError = connectionError || pubsubError || queryError;

  const dismissActiveError = () => {
    if (connectionError) setConnectionError(null);
    if (pubsubError) setPubsubError(null);
    if (queryError) setQueryError(null);
  };

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
        if (e.key === '1') {
          e.preventDefault();
          setActiveTab('pubsub');
        } else if (e.key === '2') {
          e.preventDefault();
          setActiveTab('query');
        } else if (e.key === '3') {
          e.preventDefault();
          setActiveTab('settings');
        } else if (e.key === 'b' || e.key === 'B') {
          e.preventDefault();
          setSidebarOpen((prev) => !prev);
        } else if (e.key === 'k' || e.key === 'K') {
          e.preventDefault();
          setScoutModalOpen(true);
        } else if (e.key === 'n' || e.key === 'N') {
          e.preventDefault();
          setEditingProfile(null);
          setProfileModalOpen(true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleToggleConnection = async () => {
    if (!selectedProfile) return;
    if (isConnected) {
      await disconnect(selectedProfile.id);
    } else {
      await connect(selectedProfile.id);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-background text-foreground overflow-hidden select-none">
      {/* Top Application Header */}
      <header className="h-12 border-b bg-card px-3 flex items-center justify-between shrink-0 z-20">
        {/* Left Section: Sidebar Toggle & Brand Title */}
        <div className="flex items-center gap-2.5">
          <Button
            variant="ghost"
            size="iconSm"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            title={sidebarOpen ? 'Collapse sidebar (Ctrl+B)' : 'Expand sidebar (Ctrl+B)'}
          >
            {sidebarOpen ? (
              <PanelLeftClose className="w-4 h-4" />
            ) : (
              <PanelLeftOpen className="w-4 h-4" />
            )}
          </Button>

          {/* App Brand Logo */}
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setActiveTab('pubsub')}>
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Zap className="w-3.5 h-3.5 fill-current" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm tracking-tight text-foreground">
                ZenohX
              </span>
              <Badge variant="outline" className="text-[10px] px-1 py-0 font-mono font-normal">
                v0.1.0
              </Badge>
            </div>
          </div>
        </div>

        {/* Center Section: Workspace Tab Switcher */}
        <nav className="flex items-center rounded-md bg-muted p-0.5">
          {/* Tab 1: Pub / Sub */}
          <button
            type="button"
            onClick={() => setActiveTab('pubsub')}
            className={`inline-flex items-center gap-1.5 rounded-sm px-3 py-1 text-xs font-medium transition-colors ${
              activeTab === 'pubsub'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Pub / Sub Streaming (Ctrl+1)"
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Pub / Sub</span>
            {activeSubsCount > 0 && (
              <span className="ml-1 inline-flex items-center justify-center rounded-full bg-secondary text-secondary-foreground px-1.5 py-0 text-[10px] font-mono">
                {activeSubsCount}
              </span>
            )}
          </button>

          {/* Tab 2: Query / RPC */}
          <button
            type="button"
            onClick={() => setActiveTab('query')}
            className={`inline-flex items-center gap-1.5 rounded-sm px-3 py-1 text-xs font-medium transition-colors ${
              activeTab === 'query'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Query & RPC Evaluation (Ctrl+2)"
          >
            <Search className="w-3.5 h-3.5" />
            <span>Query / RPC</span>
            {pendingInboundCount > 0 && (
              <span className="ml-1 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground px-1.5 py-0 text-[10px] font-mono font-medium">
                {pendingInboundCount}
              </span>
            )}
          </button>

          {/* Tab 3: Settings / History */}
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`inline-flex items-center gap-1.5 rounded-sm px-3 py-1 text-xs font-medium transition-colors ${
              activeTab === 'settings'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Settings & History (Ctrl+3)"
          >
            <History className="w-3.5 h-3.5" />
            <span>History / DB</span>
          </button>
        </nav>

        {/* Right Section: Active Connection Status & Quick Controls */}
        <div className="flex items-center gap-2">
          {selectedProfile ? (
            <div className="flex items-center gap-2 pl-2.5 pr-1 py-1 rounded-md border bg-card">
              {/* Active Profile Info */}
              <div className="flex items-center gap-1.5">
                <span
                  className={`h-2 w-2 rounded-full ${
                    isConnecting
                      ? 'bg-amber-500 animate-pulse'
                      : isConnected
                      ? 'bg-emerald-500'
                      : 'bg-muted-foreground/40'
                  }`}
                />
                <span className="text-xs font-medium max-w-[140px] truncate text-foreground">
                  {selectedProfile.name}
                </span>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 uppercase font-mono">
                  {selectedProfile.mode}
                </Badge>
              </div>

              {/* Connect / Disconnect Action Button */}
              <Button
                type="button"
                variant={isConnected ? 'destructive' : 'default'}
                size="sm"
                onClick={handleToggleConnection}
                disabled={isConnecting}
                className="h-6 px-2.5 text-xs gap-1 font-medium"
              >
                {isConnecting ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Connecting...</span>
                  </>
                ) : isConnected ? (
                  <>
                    <PowerOff className="w-3 h-3" />
                    <span>Disconnect</span>
                  </>
                ) : (
                  <>
                    <Power className="w-3 h-3" />
                    <span>Connect</span>
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setScoutModalOpen(true)}
                className="h-7 text-xs gap-1"
              >
                <Radar className="w-3.5 h-3.5" />
                <span>Scout LAN</span>
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  setEditingProfile(null);
                  setProfileModalOpen(true);
                }}
                className="h-7 text-xs gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Profile</span>
              </Button>
            </div>
          )}
        </div>
      </header>

      {/* Main Stage: Sidebar + Active Workspace */}
      <div className="flex-1 flex min-h-0 relative overflow-hidden">
        {/* Left Sidebar */}
        {sidebarOpen && (
          <Sidebar
            className="transition-all duration-200"
            onSelectProfile={(p) => selectProfile(p.id)}
          />
        )}

        {/* Central Workspace Area */}
        <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-background">
          {profiles.length === 0 ? (
            /* Empty State */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto space-y-4">
              <div className="p-3 rounded-lg bg-muted text-muted-foreground border">
                <Zap className="w-8 h-8" />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-lg font-semibold tracking-tight text-foreground">
                  Welcome to ZenohX
                </h2>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Desktop GUI client for Eclipse Zenoh networks.
                  Create a connection profile or scout your local network to start publishing, subscribing, and querying.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setScoutModalOpen(true)}
                  className="gap-1.5 text-xs"
                >
                  <Radar className="w-3.5 h-3.5" />
                  Scout LAN
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => {
                    setEditingProfile(null);
                    setProfileModalOpen(true);
                  }}
                  className="gap-1.5 text-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Create Profile
                </Button>
              </div>

              {/* Feature Highlights Grid */}
              <div className="grid grid-cols-2 gap-2.5 pt-4 w-full text-left">
                <div className="p-3 rounded-md border bg-card space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                    <Radio className="w-3.5 h-3.5 text-muted-foreground" />
                    Pub / Sub
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Real-time sample stream with JSON, CBOR, and Hex viewers.
                  </p>
                </div>
                <div className="p-3 rounded-md border bg-card space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                    <Search className="w-3.5 h-3.5 text-muted-foreground" />
                    Query & RPC
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Distributed queries, queryables, and reply timelines.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            /* Active Workspace View */
            <>
              {activeTab === 'pubsub' && <PubSubWorkspace className="h-full" />}
              {activeTab === 'query' && <QueryWorkspace className="h-full" />}
              {activeTab === 'settings' && <SettingsWorkspace className="h-full" />}
            </>
          )}
        </main>
      </div>

      {/* Global Error Notification Toast */}
      {activeError && (
        <aside
          role="alert"
          aria-live="assertive"
          className="fixed bottom-4 right-4 max-w-md p-3.5 rounded-lg bg-destructive text-destructive-foreground shadow-lg border border-destructive-foreground/20 flex items-start gap-3 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200"
        >
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-destructive-foreground" />
          <div className="flex-1 text-xs">
            <p className="font-semibold">Operation Error</p>
            <p className="mt-0.5 opacity-90 break-words leading-relaxed">
              {activeError}
            </p>
          </div>
          <button
            type="button"
            onClick={dismissActiveError}
            className="p-1 rounded-sm text-destructive-foreground/80 hover:text-destructive-foreground hover:bg-destructive-foreground/10 transition-colors"
            title="Dismiss error"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </aside>
      )}

      {/* Root Modals: Profile Editor & Scout LAN */}
      <ProfileModal
        isOpen={profileModalOpen}
        onClose={() => {
          setProfileModalOpen(false);
          setEditingProfile(null);
        }}
        profile={editingProfile}
      />

      <ScoutModal
        isOpen={scoutModalOpen}
        onClose={() => setScoutModalOpen(false)}
        onOpenProfileEditor={(newProf) => {
          setEditingProfile(newProf);
          setProfileModalOpen(true);
        }}
      />
    </div>
  );
}

export default App;
