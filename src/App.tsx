import { useState, useEffect, useCallback } from 'react';
import {
  Radio,
  Search,
  History,
  Radar,
  Plus,
  Power,
  PowerOff,
  PanelLeftClose,
  PanelLeftOpen,
  AlertTriangle,
  X,
  Zap,
  Loader2,
} from 'lucide-react';
import { Button } from './components/ui/button';
import { Badge } from './components/ui/badge';
import { Sidebar } from './components/connections/Sidebar';
import { ProfileModal } from './components/connections/ProfileModal';
import { ScoutModal } from './components/connections/ScoutModal';
import { PubSubWorkspace } from './components/pubsub/PubSubWorkspace';
import { QueryWorkspace } from './components/query/QueryWorkspace';
import { SettingsWorkspace } from './components/settings/SettingsWorkspace';
import { useConnectionStore } from './stores/connectionStore';
import { useMessageStore } from './stores/messageStore';
import { useQueryStore } from './stores/queryStore';
import type { ConnectionProfile } from './types/zenoh';

export type WorkspaceView = 'pubsub' | 'query' | 'settings';

export function App() {
  // Navigation and Layout State
  const [activeTab, setActiveTab] = useState<WorkspaceView>('pubsub');
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);

  // Global Modals State
  const [profileModalOpen, setProfileModalOpen] = useState<boolean>(false);
  const [editingProfile, setEditingProfile] = useState<ConnectionProfile | null>(null);
  const [scoutModalOpen, setScoutModalOpen] = useState<boolean>(false);

  // Connection Store
  const {
    profiles,
    selectedProfileId,
    activeSessions,
    connectingProfileIds,
    error: connectionError,
    loadProfiles,
    selectProfile,
    connect,
    disconnect,
    setError: setConnectionError,
    getSelectedProfile,
  } = useConnectionStore();

  // Message & Query Stores
  const {
    subscriptions,
    error: messageError,
    setError: setMessageError,
  } = useMessageStore();

  const {
    inboundQueries,
    error: queryError,
    setError: setQueryError,
  } = useQueryStore();

  // Initial loading
  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  const selectedProfile = getSelectedProfile();
  const session = selectedProfileId ? activeSessions[selectedProfileId] : undefined;
  const isConnected = Boolean(session);
  const isConnecting = selectedProfileId ? Boolean(connectingProfileIds[selectedProfileId]) : false;

  // Active errors collection for global toast banner
  const activeError = connectionError || messageError || queryError;

  const dismissActiveError = useCallback(() => {
    if (connectionError) setConnectionError(null);
    if (messageError) setMessageError(null);
    if (queryError) setQueryError(null);
  }, [connectionError, messageError, queryError, setConnectionError, setMessageError, setQueryError]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMetaOrCtrl = e.metaKey || e.ctrlKey;

      if (isMetaOrCtrl && e.key === '1') {
        e.preventDefault();
        setActiveTab('pubsub');
      } else if (isMetaOrCtrl && e.key === '2') {
        e.preventDefault();
        setActiveTab('query');
      } else if (isMetaOrCtrl && e.key === '3') {
        e.preventDefault();
        setActiveTab('settings');
      } else if (isMetaOrCtrl && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setSidebarOpen((prev) => !prev);
      } else if (isMetaOrCtrl && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setScoutModalOpen(true);
      } else if (isMetaOrCtrl && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setEditingProfile(null);
        setProfileModalOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handle Quick Connect / Disconnect
  const handleToggleConnection = async () => {
    if (!selectedProfile || isConnecting) return;
    try {
      if (isConnected) {
        await disconnect(selectedProfile.id);
      } else {
        await connect(selectedProfile.id);
      }
    } catch {
      // Error handled by store
    }
  };

  // Subscription and Inbound counters for tab badges
  const activeSubsCount = selectedProfileId && session
    ? subscriptions.filter((s) => !s.sessionId || s.sessionId === session.id).length
    : subscriptions.length;

  const pendingInboundCount = selectedProfileId && session
    ? inboundQueries.filter((q) => !q.session_id || q.session_id === session.id).length
    : inboundQueries.length;

  return (
    <div className="flex h-screen w-screen flex-col bg-background text-foreground overflow-hidden font-sans select-none antialiased">
      {/* ========================================================================= */}
      {/* Top Application Header Bar */}
      {/* ========================================================================= */}
      <header className="flex h-12 items-center justify-between border-b bg-card px-3 shrink-0 shadow-xs z-20">
        {/* Left Section: Brand Logo & Sidebar Toggle */}
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
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 shadow-sm text-white">
              <Zap className="w-4 h-4 fill-white" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-sm tracking-tight bg-gradient-to-r from-foreground via-foreground to-foreground/70 bg-clip-text text-transparent">
                ZenohX
              </span>
              <Badge variant="outline" className="text-[9px] px-1 py-0 font-mono font-normal">
                v0.1.0
              </Badge>
            </div>
          </div>
        </div>

        {/* Center Section: Workspace Tab Switcher */}
        <nav className="flex items-center rounded-lg bg-muted/70 p-1">
          {/* Tab 1: Pub / Sub */}
          <button
            type="button"
            onClick={() => setActiveTab('pubsub')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-all ${
              activeTab === 'pubsub'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Pub / Sub Streaming (Ctrl+1)"
          >
            <Radio className="w-3.5 h-3.5 text-blue-500" />
            <span>Pub / Sub</span>
            {activeSubsCount > 0 && (
              <span className="ml-0.5 inline-flex items-center justify-center rounded-full bg-blue-500/20 text-blue-600 dark:text-blue-400 px-1.5 py-0 text-[10px] font-bold font-mono">
                {activeSubsCount}
              </span>
            )}
          </button>

          {/* Tab 2: Query / RPC */}
          <button
            type="button"
            onClick={() => setActiveTab('query')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-all ${
              activeTab === 'query'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Query & RPC Evaluation (Ctrl+2)"
          >
            <Search className="w-3.5 h-3.5 text-purple-500" />
            <span>Query / RPC</span>
            {pendingInboundCount > 0 && (
              <span className="ml-0.5 inline-flex items-center justify-center rounded-full bg-purple-500 text-white px-1.5 py-0 text-[10px] font-bold font-mono">
                {pendingInboundCount}
              </span>
            )}
          </button>

          {/* Tab 3: Settings / History */}
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-all ${
              activeTab === 'settings'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Settings & History (Ctrl+3)"
          >
            <History className="w-3.5 h-3.5 text-amber-500" />
            <span>History / DB</span>
          </button>
        </nav>

        {/* Right Section: Active Connection Status & Quick Controls */}
        <div className="flex items-center gap-2">
          {selectedProfile ? (
            <div className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-lg border bg-muted/30">
              {/* Active Profile Info */}
              <div className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  {isConnecting ? (
                    <Loader2 className="w-2.5 h-2.5 animate-spin text-amber-500" />
                  ) : isConnected ? (
                    <>
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </>
                  ) : (
                    <span className="inline-flex rounded-full h-2 w-2 bg-muted-foreground/40"></span>
                  )}
                </span>
                <span className="text-xs font-semibold max-w-[120px] truncate text-foreground">
                  {selectedProfile.name}
                </span>
                <Badge
                  variant={
                    selectedProfile.mode === 'router'
                      ? 'purple'
                      : selectedProfile.mode === 'client'
                      ? 'success'
                      : 'info'
                  }
                  className="text-[9px] px-1 py-0 uppercase font-mono"
                >
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
                className="h-6 px-2 text-[11px] gap-1 shadow-xs font-semibold"
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
                className="h-7 text-xs gap-1 text-blue-600 dark:text-blue-400"
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

      {/* ========================================================================= */}
      {/* Main Stage: Sidebar + Active Workspace */}
      {/* ========================================================================= */}
      <div className="flex-1 flex min-h-0 relative overflow-hidden">
        {/* Left Sidebar (Connections & Profiles) */}
        {sidebarOpen && (
          <Sidebar
            className="transition-all duration-200"
            onSelectProfile={(p) => selectProfile(p.id)}
          />
        )}

        {/* Central Workspace Area */}
        <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-background">
          {profiles.length === 0 ? (
            /* Empty State: No profiles created yet */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-lg mx-auto space-y-4">
              <div className="p-4 rounded-2xl bg-primary/10 text-primary border border-primary/20 shadow-sm">
                <Zap className="w-10 h-10" />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-xl font-bold tracking-tight text-foreground">
                  Welcome to ZenohX
                </h2>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  High-performance, modern GUI client for Eclipse Zenoh networks.
                  Create a connection profile or scout your local network to start publishing, subscribing, and executing queries.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setScoutModalOpen(true)}
                  className="gap-1.5 text-xs shadow-xs"
                >
                  <Radar className="w-4 h-4 text-blue-500" />
                  Scout LAN (Multicast)
                </Button>
                <Button
                  variant="default"
                  onClick={() => {
                    setEditingProfile(null);
                    setProfileModalOpen(true);
                  }}
                  className="gap-1.5 text-xs shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  Create Profile
                </Button>
              </div>

              {/* Feature Highlights Grid */}
              <div className="grid grid-cols-2 gap-3 pt-6 w-full text-left">
                <div className="p-3 rounded-lg border bg-card/60 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <Radio className="w-3.5 h-3.5 text-blue-500" />
                    Pub / Sub Streaming
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    High-throughput virtualized sample stream with multi-format codecs.
                  </p>
                </div>
                <div className="p-3 rounded-lg border bg-card/60 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <Search className="w-3.5 h-3.5 text-purple-500" />
                    Query & RPC Simulator
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Distributed queries, queryable endpoints, and multi-reply timelines.
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

      {/* ========================================================================= */}
      {/* Global Error Notification Toast */}
      {/* ========================================================================= */}
      {activeError && (
        <aside
          role="alert"
          aria-live="assertive"
          className="fixed bottom-4 right-4 max-w-md p-3.5 rounded-xl bg-destructive text-destructive-foreground shadow-xl border border-destructive-foreground/20 flex items-start gap-3 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200"
        >
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-destructive-foreground" />
          <div className="flex-1 text-xs">
            <p className="font-bold">Operation Error</p>
            <p className="mt-0.5 opacity-90 break-words leading-relaxed">
              {activeError}
            </p>
          </div>
          <button
            type="button"
            onClick={dismissActiveError}
            className="p-1 rounded-md text-destructive-foreground/80 hover:text-destructive-foreground hover:bg-destructive-foreground/10 transition-colors"
            title="Dismiss error"
          >
            <X className="w-4 h-4" />
          </button>
        </aside>
      )}

      {/* ========================================================================= */}
      {/* Root Modals: Profile Editor & Scout LAN */}
      {/* ========================================================================= */}
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
