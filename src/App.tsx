// Copyright 2026 ZenohX Contributors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { useEffect, useState } from 'react';
import {
  Radio,
  Search,
  Radar,
  Plus,
  Power,
  PowerOff,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  AlertTriangle,
  X,
  Lock,
  Activity,
  Sparkles,
  Download,
  Network,
} from 'lucide-react';
import { useConnectionStore } from './stores/connectionStore';
import { useMessageStore } from './stores/messageStore';
import { useQueryStore } from './stores/queryStore';
import { useTrafficStore, initTrafficTicker } from './stores/trafficStore';
import { useSettingsStore, applyThemeToDom } from './stores/settingsStore';
import { useTopologyStore } from './stores/topologyStore';
import { useUpdateStore } from './stores/updateStore';
import { initTelemetry, trackAppStart } from './lib/telemetry';
import { ConnectionProfile } from './types/zenoh';
import { isTlsEnabled } from './lib/tls';
import { formatThroughput } from './lib/trafficFormatters';
import { APP_VERSION } from './lib/version';
import { Sidebar } from './components/connections/Sidebar';
import { ProfileModal } from './components/connections/ProfileModal';
import { ScoutModal } from './components/connections/ScoutModal';
import { PubSubWorkspace } from './components/pubsub/PubSubWorkspace';
import { QueryWorkspace } from './components/query/QueryWorkspace';
import { TrafficWorkspace } from './components/traffic/TrafficWorkspace';
import { TopologyWorkspace } from './components/topology/TopologyWorkspace';
import { SettingsWorkspace } from './components/settings/SettingsWorkspace';
import { Button } from './components/ui/button';
import { Badge } from './components/ui/badge';
import { ResizeHandle } from './components/ui/resize-handle';
import { useResizable } from './hooks/useResizable';
import zenohxIcon from './assets/icon.png';

import { formatFriendlyError } from './lib/errorUtils';

export function App() {
  const [activeTab, setActiveTab] = useState<'pubsub' | 'query' | 'traffic' | 'topology' | 'settings'>('pubsub');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<ConnectionProfile | null>(null);
  const [scoutModalOpen, setScoutModalOpen] = useState(false);

  // Resizable Sidebar
  const {
    size: sidebarWidth,
    isDragging: isSidebarDragging,
    startDragging: startSidebarDragging,
    resetToDefault: resetSidebarWidth,
  } = useResizable({
    initialSize: 280,
    minSize: 220,
    maxSize: 500,
    storageKey: 'zenohx_sidebar_width',
  });

  // Connection store state
  const profiles = useConnectionStore((s) => s.profiles);
  const selectedProfileId = useConnectionStore((s) => s.selectedProfileId);
  const activeSessions = useConnectionStore((s) => s.activeSessions);
  const connectingProfileIds = useConnectionStore((s) => s.connectingProfileIds);
  const scoutedNodes = useConnectionStore((s) => s.scoutedNodes);
  const loadProfiles = useConnectionStore((s) => s.loadProfiles);
  const initStatusListener = useConnectionStore((s) => s.initStatusListener);
  const cleanupStatusListener = useConnectionStore((s) => s.cleanupStatusListener);
  const selectProfile = useConnectionStore((s) => s.selectProfile);
  const connect = useConnectionStore((s) => s.connect);
  const disconnect = useConnectionStore((s) => s.disconnect);
  const connectionError = useConnectionStore((s) => s.error);
  const setConnectionError = useConnectionStore((s) => s.setError);

  // Topology store state for node count & graph sync
  const topologyNodes = useTopologyStore((s) => s.nodes);
  const syncTopology = useTopologyStore((s) => s.syncFromContext);

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

  // Traffic store state for throughput badge
  const currentInboundBps = useTrafficStore((s) => s.currentInboundBps);
  const currentOutboundBps = useTrafficStore((s) => s.currentOutboundBps);
  const currentThroughputBps = currentInboundBps + currentOutboundBps;

  // Global error message
  const activeError = connectionError || pubsubError || queryError;
  const friendlyError = activeError ? formatFriendlyError(activeError) : null;

  const dismissActiveError = () => {
    if (connectionError) setConnectionError(null);
    if (pubsubError) setPubsubError(null);
    if (queryError) setQueryError(null);
  };

  // Auto-dismiss active error after 7 seconds
  useEffect(() => {
    if (!activeError) return;
    const timer = setTimeout(() => {
      dismissActiveError();
    }, 7000);
    return () => clearTimeout(timer);
  }, [activeError]);

  const theme = useSettingsStore((s) => s.theme);
  const autoCheckUpdates = useSettingsStore((s) => s.autoCheckUpdates);

  const checkForUpdates = useUpdateStore((s) => s.checkForUpdates);
  const showNotification = useUpdateStore((s) => s.showNotification);
  const updateVersion = useUpdateStore((s) => s.version);
  const installAndRestart = useUpdateStore((s) => s.installAndRestart);
  const skipConsent = useUpdateStore((s) => s.skipConsent);

  // Apply active theme to DOM root and listen to OS theme if set to 'system'
  useEffect(() => {
    applyThemeToDom(theme);

    if (theme === 'system' && typeof window !== 'undefined' && window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => applyThemeToDom('system');
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [theme]);

  // Background auto-check for updates on launch
  useEffect(() => {
    if (autoCheckUpdates) {
      checkForUpdates(false);
    }
  }, [autoCheckUpdates, checkForUpdates]);

  // Initialize anonymous telemetry on application startup
  useEffect(() => {
    initTelemetry();
    trackAppStart();
  }, []);

  useEffect(() => {
    loadProfiles();
    useConnectionStore.getState().refreshSessions();
    initStatusListener();
    useMessageStore.getState().initListener();
    useQueryStore.getState().initListener();
    return () => {
      cleanupStatusListener();
      useMessageStore.getState().cleanupListener();
      useQueryStore.getState().cleanupListener();
    };
  }, [loadProfiles, initStatusListener, cleanupStatusListener]);

  // Sync topology data whenever scouted nodes, sessions, or profiles change
  useEffect(() => {
    syncTopology({
      scoutedNodes,
      activeSessions,
      profiles,
    });
  }, [scoutedNodes, activeSessions, profiles, syncTopology]);

  // Continuous real-time session introspection & telemetry from Rust backend
  useEffect(() => {
    const interval = setInterval(() => {
      useConnectionStore.getState().refreshSessions();
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Initialize continuous global traffic ticker
  useEffect(() => {
    const cleanup = initTrafficTicker();
    return cleanup;
  }, []);

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
          setActiveTab('traffic');
        } else if (e.key === '4') {
          e.preventDefault();
          setActiveTab('topology');
        } else if (e.key === '5') {
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
      } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        setActiveTab('settings');
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
        {/* Left Section: Settings & Sidebar Toggle & Brand Title */}
        <div className="flex items-center gap-2">
          {/* Settings Button */}
          <Button
            variant="ghost"
            size="iconSm"
            onClick={() => setActiveTab('settings')}
            className={`h-8 w-8 transition-colors ${
              activeTab === 'settings'
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Settings & Preferences (Ctrl+5)"
          >
            <Settings className="w-4 h-4" />
          </Button>

          {/* Sidebar Toggle */}
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
            <img
              src={zenohxIcon}
              alt="ZenohX Icon"
              className="h-6 w-6 rounded-md object-contain shadow-xs"
            />
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm tracking-tight text-foreground">
                ZenohX
              </span>
              <Badge variant="outline" className="text-[10px] px-1 py-0 font-mono font-normal">
                v{APP_VERSION}
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

          {/* Tab 3: Traffic Monitor */}
          <button
            type="button"
            onClick={() => setActiveTab('traffic')}
            className={`inline-flex items-center gap-1.5 rounded-sm px-3 py-1 text-xs font-medium transition-colors ${
              activeTab === 'traffic'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Traffic & Telemetry Monitor (Ctrl+3)"
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Traffic Monitor</span>
            {currentThroughputBps > 0 && (
              <span className="ml-1 inline-flex items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-1.5 py-0 text-[10px] font-mono font-medium">
                {formatThroughput(currentThroughputBps)}
              </span>
            )}
          </button>

          {/* Tab 4: Topology Graph */}
          <button
            type="button"
            onClick={() => setActiveTab('topology')}
            className={`inline-flex items-center gap-1.5 rounded-sm px-3 py-1 text-xs font-medium transition-colors ${
              activeTab === 'topology'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Network Topology Graph (Ctrl+4)"
          >
            <Network className="w-3.5 h-3.5" />
            <span>Topology</span>
            {topologyNodes.length > 0 && (
              <span className="ml-1 inline-flex items-center justify-center rounded-full bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 px-1.5 py-0 text-[10px] font-mono font-medium">
                {topologyNodes.length}
              </span>
            )}
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
                {isTlsEnabled(selectedProfile.tls_config, selectedProfile.connect_locators) && (
                  <Badge
                    variant="secondary"
                    className="text-[9px] px-1.5 py-0 font-mono gap-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                    title="TLS / SSL Encrypted Session"
                  >
                    <Lock className="w-2.5 h-2.5 inline-block" />
                    SSL
                  </Badge>
                )}
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
          <>
            <Sidebar
              style={{ width: `${sidebarWidth}px` }}
              onSelectProfile={(p) => selectProfile(p.id)}
            />
            <ResizeHandle
              isDragging={isSidebarDragging}
              onMouseDown={startSidebarDragging}
              onReset={resetSidebarWidth}
            />
          </>
        )}

        {/* Central Workspace Area */}
        <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-background">
          {activeTab === 'settings' ? (
            <SettingsWorkspace className="h-full" />
          ) : activeTab === 'topology' ? (
            <TopologyWorkspace
              className="h-full"
              onOpenProfileEditor={(prof) => {
                setEditingProfile(prof);
                setProfileModalOpen(true);
              }}
              onNavigateToPubSub={() => setActiveTab('pubsub')}
            />
          ) : activeTab === 'traffic' ? (
            <TrafficWorkspace className="h-full" />
          ) : activeTab === 'query' ? (
            <QueryWorkspace className="h-full" />
          ) : profiles.length === 0 ? (
            /* Empty State for Pub/Sub Onboarding */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-lg mx-auto space-y-4">
              <div className="p-3 rounded-2xl bg-card border shadow-sm">
                <img
                  src={zenohxIcon}
                  alt="ZenohX Logo"
                  className="w-12 h-12 rounded-xl object-contain"
                />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-lg font-semibold tracking-tight text-foreground">
                  Welcome to ZenohX
                </h2>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Desktop GUI client for Eclipse Zenoh networks.
                  Create a connection profile or scout your local network to start publishing, subscribing, querying, and monitoring traffic.
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
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 pt-4 w-full text-left">
                <div
                  className="p-3 rounded-md border bg-card space-y-1 cursor-pointer hover:border-foreground/40 transition-colors"
                  onClick={() => setActiveTab('pubsub')}
                >
                  <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                    <Radio className="w-3.5 h-3.5 text-muted-foreground" />
                    Pub / Sub
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Real-time sample stream with JSON, CBOR, and Hex viewers.
                  </p>
                </div>
                <div
                  className="p-3 rounded-md border bg-card space-y-1 cursor-pointer hover:border-foreground/40 transition-colors"
                  onClick={() => setActiveTab('query')}
                >
                  <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                    <Search className="w-3.5 h-3.5 text-muted-foreground" />
                    Query & RPC
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Distributed queries, queryables, and reply timelines.
                  </p>
                </div>
                <div
                  className="p-3 rounded-md border bg-card space-y-1 cursor-pointer hover:border-foreground/40 transition-colors"
                  onClick={() => setActiveTab('traffic')}
                >
                  <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                    <Activity className="w-3.5 h-3.5 text-muted-foreground" />
                    Traffic Monitor
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Live bandwidth chart, message rates, and per-key telemetry.
                  </p>
                </div>
                <div
                  className="p-3 rounded-md border bg-card space-y-1 cursor-pointer hover:border-foreground/40 transition-colors"
                  onClick={() => setActiveTab('topology')}
                >
                  <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                    <Network className="w-3.5 h-3.5 text-muted-foreground" />
                    Topology
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Interactive mesh graph, live scouted peers, and node inspector.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <PubSubWorkspace className="h-full" />
          )}
        </main>
      </div>

      {/* Global Error Notification Toast */}
      {friendlyError && (
        <aside
          role="alert"
          aria-live="assertive"
          className="fixed bottom-4 right-4 max-w-md p-3.5 rounded-xl bg-card border border-destructive/30 shadow-xl flex items-start gap-3 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200"
        >
          <div className="p-1.5 rounded-lg bg-destructive/10 text-destructive shrink-0">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0 space-y-0.5 text-xs">
            <p className="font-semibold text-foreground">{friendlyError.title}</p>
            <p className="text-muted-foreground leading-relaxed">
              {friendlyError.message}
            </p>
            {friendlyError.suggestion && (
              <p className="text-[11px] text-muted-foreground/80 pt-0.5 leading-normal">
                {friendlyError.suggestion}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={dismissActiveError}
            className="p-1 rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Dismiss error"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </aside>
      )}

      {/* Auto-Update Ready Consent Notification Banner */}
      {showNotification && (
        <aside
          role="status"
          aria-live="polite"
          className="fixed bottom-4 right-4 max-w-md p-4 rounded-xl bg-card border shadow-xl flex items-start gap-3.5 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200"
        >
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-foreground">
                ZenohX v{updateVersion} Ready
              </p>
              <button
                type="button"
                onClick={skipConsent}
                className="text-muted-foreground hover:text-foreground p-0.5 rounded-sm transition-colors"
                title="Skip for now"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              The update has finished downloading in the background. Would you like to restart and apply it now?
            </p>
            <div className="flex items-center gap-2 pt-2">
              <Button
                type="button"
                size="sm"
                onClick={installAndRestart}
                className="h-7 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium gap-1.5"
              >
                <Download className="w-3 h-3" />
                <span>Restart & Update</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={skipConsent}
                className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <span>Skip</span>
              </Button>
            </div>
          </div>
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
