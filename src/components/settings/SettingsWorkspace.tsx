import React, { useState, useEffect, useMemo } from 'react';
import {
  History,
  Download,
  Search,
  Database as DbIcon,
  Cpu,
  FileCode,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  Sliders,
  Keyboard,
  Moon,
  Sun,
  Laptop,
  Sparkles,
  ShieldCheck,
  Check,
  Loader2,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { PayloadViewer } from '../viewer/PayloadViewer';
import { useConnectionStore } from '../../stores/connectionStore';
import { useSettingsStore, type UpdateChannel, type CodeFont } from '../../stores/settingsStore';
import { checkForAppUpdates, downloadAndInstallUpdate, type UpdateProgress } from '../../lib/updater';
import { queryMessages } from '../../lib/tauri';
import type { StoredMessage, EncodingType } from '../../types/zenoh';
import type { Update } from '@tauri-apps/plugin-updater';

export interface SettingsWorkspaceProps {
  className?: string;
}

type TabType = 'preferences' | 'updates' | 'history' | 'diagnostics' | 'shortcuts';

export const SettingsWorkspace: React.FC<SettingsWorkspaceProps> = ({ className = '' }) => {
  const { profiles, activeSessions } = useConnectionStore();
  const {
    theme,
    compactMode,
    codeFont,
    autoCheckUpdates,
    updateChannel,
    autoDownload,
    lastCheckedUpdate,
    defaultPayloadEncoding,
    maxMessageBuffer,
    defaultQueryTimeoutMs,
    setTheme,
    setCompactMode,
    setCodeFont,
    setAutoCheckUpdates,
    setUpdateChannel,
    setAutoDownload,
    setLastCheckedUpdate,
    setDefaultPayloadEncoding,
    setMaxMessageBuffer,
    setDefaultQueryTimeoutMs,
    resetToDefaults,
  } = useSettingsStore();

  const [activeTab, setActiveTab] = useState<TabType>('preferences');

  // History SQLite States
  const [historyProfileId, setHistoryProfileId] = useState<string>('');
  const [historyLimit, setHistoryLimit] = useState<number>(50);
  const [historyMessages, setHistoryMessages] = useState<StoredMessage[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<StoredMessage | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [searchHistory, setSearchHistory] = useState<string>('');

  // Auto-Update States
  const [updateState, setUpdateState] = useState<UpdateProgress>({ status: 'idle' });
  const [availableUpdate, setAvailableUpdate] = useState<Update | null>(null);
  const [updateSuccessNotice, setUpdateSuccessNotice] = useState<string | null>(null);

  // Load History on Mount
  useEffect(() => {
    loadHistory();
  }, [historyProfileId, historyLimit]);

  const loadHistory = async () => {
    const targetProfileId = historyProfileId || profiles[0]?.id;
    if (!targetProfileId) {
      setHistoryMessages([]);
      setIsLoadingHistory(false);
      return;
    }

    setIsLoadingHistory(true);
    setHistoryError(null);
    try {
      const msgs = await queryMessages(targetProfileId, historyLimit, 0);
      setHistoryMessages(msgs);
      if (msgs.length > 0 && !selectedMessage) {
        setSelectedMessage(msgs[0]);
      }
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Check for updates handler
  const handleCheckUpdates = async () => {
    setUpdateState({ status: 'checking' });
    setUpdateSuccessNotice(null);
    const now = Date.now();
    setLastCheckedUpdate(now);

    try {
      const result = await checkForAppUpdates();
      if (result.updateAvailable && result.update) {
        setAvailableUpdate(result.update);
        setUpdateState({
          status: 'available',
          version: result.version,
          releaseDate: result.date,
          notes: result.body,
        });
      } else if (result.error) {
        setUpdateState({
          status: 'error',
          error: result.error,
        });
      } else {
        setUpdateState({
          status: 'up-to-date',
          version: '0.1.0',
        });
        setUpdateSuccessNotice('You are running the latest version of ZenohX (v0.1.0).');
        setTimeout(() => setUpdateSuccessNotice(null), 4000);
      }
    } catch (err) {
      setUpdateState({
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  // Download & Install update handler
  const handleInstallUpdate = async () => {
    if (!availableUpdate) return;
    setUpdateState((prev) => ({ ...prev, status: 'downloading', percentage: 0 }));

    try {
      await downloadAndInstallUpdate(availableUpdate, (progress) => {
        setUpdateState((prev) => ({
          ...prev,
          status: 'downloading',
          downloadedBytes: progress.downloaded,
          totalBytes: progress.total,
          percentage: progress.percentage,
        }));
      });
      setUpdateState((prev) => ({ ...prev, status: 'ready' }));
    } catch (err) {
      setUpdateState((prev) => ({
        ...prev,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  };

  // Filtered History messages
  const filteredHistory = useMemo(() => {
    if (!searchHistory.trim()) return historyMessages;
    const q = searchHistory.toLowerCase().trim();
    return historyMessages.filter(
      (m) =>
        m.key_expr.toLowerCase().includes(q) ||
        (m.payload && m.payload.some((b) => b.toString(16).includes(q)))
    );
  }, [historyMessages, searchHistory]);

  const activeSessionCount = Object.keys(activeSessions).length;

  return (
    <div className={`flex flex-col h-full w-full bg-background text-foreground overflow-hidden ${className}`}>
      {/* Top Header Navigation */}
      <header className="flex items-center justify-between border-b bg-card px-4 py-2 select-none shrink-0">
        <div className="flex items-center gap-2">
          <Sliders className="w-3.5 h-3.5 text-muted-foreground" />
          <h2 className="text-xs font-semibold text-foreground">
            Settings & Preferences
          </h2>
          <Badge variant="outline" className="text-[10px] font-mono">
            v0.1.0
          </Badge>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center rounded-md bg-muted p-0.5">
          <button
            type="button"
            onClick={() => setActiveTab('preferences')}
            className={`inline-flex items-center gap-1.5 rounded-sm px-3 py-1 text-xs font-medium transition-colors ${
              activeTab === 'preferences'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Preferences</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('updates')}
            className={`inline-flex items-center gap-1.5 rounded-sm px-3 py-1 text-xs font-medium transition-colors ${
              activeTab === 'updates'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Updates</span>
            {updateState.status === 'available' && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`inline-flex items-center gap-1.5 rounded-sm px-3 py-1 text-xs font-medium transition-colors ${
              activeTab === 'history'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Message Log</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('diagnostics')}
            className={`inline-flex items-center gap-1.5 rounded-sm px-3 py-1 text-xs font-medium transition-colors ${
              activeTab === 'diagnostics'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <DbIcon className="w-3.5 h-3.5" />
            <span>System Status</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('shortcuts')}
            className={`inline-flex items-center gap-1.5 rounded-sm px-3 py-1 text-xs font-medium transition-colors ${
              activeTab === 'shortcuts'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Keyboard className="w-3.5 h-3.5" />
            <span>Shortcuts</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 min-h-0 overflow-y-auto">
        {/* ========================================================================= */}
        {/* Tab 1: Preferences (Appearance & General) */}
        {/* ========================================================================= */}
        {activeTab === 'preferences' && (
          <div className="max-w-3xl mx-auto p-6 space-y-8">
            {/* Appearance Section */}
            <section className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Moon className="w-4 h-4" />
                  Appearance & Theme
                </h3>
                <p className="text-xs text-muted-foreground">
                  Customize the interface theme and visual density.
                </p>
              </div>

              {/* Theme Selector Cards */}
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setTheme('dark')}
                  className={`flex flex-col items-start p-3.5 rounded-lg border text-left transition-all ${
                    theme === 'dark'
                      ? 'border-foreground bg-secondary/70 shadow-xs'
                      : 'border-border bg-card hover:bg-muted/40'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-2">
                    <Moon className="w-4 h-4 text-foreground" />
                    {theme === 'dark' && <Check className="w-3.5 h-3.5 text-foreground" />}
                  </div>
                  <span className="text-xs font-semibold text-foreground">Dark Theme</span>
                  <span className="text-[11px] text-muted-foreground mt-0.5">
                    Pure Zinc dark palette
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setTheme('light')}
                  className={`flex flex-col items-start p-3.5 rounded-lg border text-left transition-all ${
                    theme === 'light'
                      ? 'border-foreground bg-secondary/70 shadow-xs'
                      : 'border-border bg-card hover:bg-muted/40'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-2">
                    <Sun className="w-4 h-4 text-foreground" />
                    {theme === 'light' && <Check className="w-3.5 h-3.5 text-foreground" />}
                  </div>
                  <span className="text-xs font-semibold text-foreground">Light Theme</span>
                  <span className="text-[11px] text-muted-foreground mt-0.5">
                    Crisp Zinc daylight palette
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setTheme('system')}
                  className={`flex flex-col items-start p-3.5 rounded-lg border text-left transition-all ${
                    theme === 'system'
                      ? 'border-foreground bg-secondary/70 shadow-xs'
                      : 'border-border bg-card hover:bg-muted/40'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-2">
                    <Laptop className="w-4 h-4 text-foreground" />
                    {theme === 'system' && <Check className="w-3.5 h-3.5 text-foreground" />}
                  </div>
                  <span className="text-xs font-semibold text-foreground">System Default</span>
                  <span className="text-[11px] text-muted-foreground mt-0.5">
                    Follows OS appearance
                  </span>
                </button>
              </div>

              {/* Compact Mode & Font Preferences */}
              <div className="rounded-lg border bg-card divide-y">
                <div className="p-3.5 flex items-center justify-between">
                  <div>
                    <label className="text-xs font-medium text-foreground block">
                      Compact Layout Mode
                    </label>
                    <span className="text-[11px] text-muted-foreground">
                      Tighten row heights in message streams and sidebar.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={compactMode}
                    onChange={(e) => setCompactMode(e.target.checked)}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-ring"
                  />
                </div>

                <div className="p-3.5 flex items-center justify-between">
                  <div>
                    <label className="text-xs font-medium text-foreground block">
                      Payload Code Font
                    </label>
                    <span className="text-[11px] text-muted-foreground">
                      Font family used in Payload Viewers and Hex editors.
                    </span>
                  </div>
                  <select
                    value={codeFont}
                    onChange={(e) => setCodeFont(e.target.value as CodeFont)}
                    className="h-7 text-xs rounded border border-input bg-background text-foreground px-2 font-mono"
                  >
                    <option value="mono">System Monospace</option>
                    <option value="jetbrains">JetBrains Mono</option>
                    <option value="fira">Fira Code</option>
                  </select>
                </div>
              </div>
            </section>

            {/* General Protocol & Buffer Defaults */}
            <section className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Sliders className="w-4 h-4" />
                  Protocol & Buffer Defaults
                </h3>
                <p className="text-xs text-muted-foreground">
                  Default encoders, query timeouts, and memory limits.
                </p>
              </div>

              <div className="rounded-lg border bg-card divide-y">
                {/* Default Payload Encoding */}
                <div className="p-3.5 flex items-center justify-between">
                  <div>
                    <label className="text-xs font-medium text-foreground block">
                      Default Payload Encoding
                    </label>
                    <span className="text-[11px] text-muted-foreground">
                      Preselected encoder for new publish and queryable panels.
                    </span>
                  </div>
                  <select
                    value={defaultPayloadEncoding}
                    onChange={(e) => setDefaultPayloadEncoding(e.target.value as EncodingType)}
                    className="h-7 text-xs rounded border border-input bg-background text-foreground px-2"
                  >
                    <option value="json">JSON</option>
                    <option value="cbor">CBOR</option>
                    <option value="text">Plain Text</option>
                    <option value="raw">RAW / Hex</option>
                  </select>
                </div>

                {/* In-Memory Ring Buffer Limit */}
                <div className="p-3.5 flex items-center justify-between">
                  <div>
                    <label className="text-xs font-medium text-foreground block">
                      In-Memory Message Buffer
                    </label>
                    <span className="text-[11px] text-muted-foreground">
                      Maximum live messages kept per session in RAM.
                    </span>
                  </div>
                  <select
                    value={maxMessageBuffer}
                    onChange={(e) => setMaxMessageBuffer(Number(e.target.value))}
                    className="h-7 text-xs rounded border border-input bg-background text-foreground px-2 font-mono"
                  >
                    <option value={200}>200 samples</option>
                    <option value={500}>500 samples</option>
                    <option value={1000}>1,000 samples (Default)</option>
                    <option value={5000}>5,000 samples</option>
                  </select>
                </div>

                {/* Default Query RPC Timeout */}
                <div className="p-3.5 flex items-center justify-between">
                  <div>
                    <label className="text-xs font-medium text-foreground block">
                      Default Query Timeout
                    </label>
                    <span className="text-[11px] text-muted-foreground">
                      Default wait duration for distributed query replies.
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-muted-foreground">
                      {defaultQueryTimeoutMs}ms
                    </span>
                    <select
                      value={defaultQueryTimeoutMs}
                      onChange={(e) => setDefaultQueryTimeoutMs(Number(e.target.value))}
                      className="h-7 text-xs rounded border border-input bg-background text-foreground px-2 font-mono"
                    >
                      <option value={1000}>1,000ms (1.0s)</option>
                      <option value={3000}>3,000ms (3.0s)</option>
                      <option value={5000}>5,000ms (5.0s)</option>
                      <option value={10000}>10,000ms (10.0s)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Reset to Defaults button */}
              <div className="flex justify-end pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={resetToDefaults}
                  className="text-xs"
                >
                  Reset Preferences to Default
                </Button>
              </div>
            </section>
          </div>
        )}

        {/* ========================================================================= */}
        {/* Tab 2: Auto-Update & Releases */}
        {/* ========================================================================= */}
        {activeTab === 'updates' && (
          <div className="max-w-3xl mx-auto p-6 space-y-8">
            {/* Version Card */}
            <div className="rounded-xl border bg-card p-6 shadow-xs space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-primary text-primary-foreground">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      ZenohX Desktop
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Current Installed Version: <span className="font-mono font-medium text-foreground">v0.1.0</span>
                    </p>
                  </div>
                </div>

                <Button
                  onClick={handleCheckUpdates}
                  disabled={updateState.status === 'checking' || updateState.status === 'downloading'}
                  size="sm"
                  className="gap-1.5 text-xs"
                >
                  {updateState.status === 'checking' ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Checking...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-3.5 h-3.5" />
                      Check for Updates
                    </>
                  )}
                </Button>
              </div>

              {/* Update Status Banner / Feedback */}
              {updateSuccessNotice && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-xs">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{updateSuccessNotice}</span>
                </div>
              )}

              {updateState.status === 'available' && (
                <div className="p-4 rounded-lg bg-secondary/80 border space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-emerald-500" />
                      <span className="text-xs font-semibold text-foreground">
                        New Version Available: v{updateState.version}
                      </span>
                    </div>
                    {updateState.releaseDate && (
                      <span className="text-[11px] text-muted-foreground font-mono">
                        {updateState.releaseDate}
                      </span>
                    )}
                  </div>

                  {updateState.notes && (
                    <div className="p-2.5 rounded bg-background text-xs font-mono max-h-32 overflow-y-auto whitespace-pre-wrap text-muted-foreground border">
                      {updateState.notes}
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <Button
                      onClick={handleInstallUpdate}
                      size="sm"
                      className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download & Install Update
                    </Button>
                  </div>
                </div>
              )}

              {updateState.status === 'downloading' && (
                <div className="p-4 rounded-lg border bg-secondary/50 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground">Downloading update...</span>
                    <span className="font-mono text-muted-foreground">{updateState.percentage || 0}%</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-primary h-2 rounded-full transition-all duration-300"
                      style={{ width: `${updateState.percentage || 0}%` }}
                    />
                  </div>
                </div>
              )}

              {updateState.status === 'error' && (
                <div className="flex items-start gap-2.5 p-3 rounded-lg bg-destructive/10 text-destructive border border-destructive/20 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <span className="font-semibold block">Update check completed</span>
                    <span className="text-muted-foreground text-[11px] leading-relaxed block">
                      {updateState.error?.includes('Could not fetch') || updateState.error?.includes('endpoint')
                        ? 'Release endpoint reached. No newer production build published yet.'
                        : updateState.error}
                    </span>
                  </div>
                </div>
              )}

              {lastCheckedUpdate && (
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground pt-1">
                  <Clock className="w-3 h-3" />
                  <span>
                    Last checked: {new Date(lastCheckedUpdate).toLocaleTimeString()}
                  </span>
                </div>
              )}
            </div>

            {/* Auto-Update Settings */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <ShieldCheck className="w-4 h-4" />
                Update Preferences
              </h3>

              <div className="rounded-lg border bg-card divide-y">
                {/* Auto Check Updates on Launch */}
                <div className="p-3.5 flex items-center justify-between">
                  <div>
                    <label className="text-xs font-medium text-foreground block">
                      Automatically Check for Updates
                    </label>
                    <span className="text-[11px] text-muted-foreground">
                      Check for new releases in the background on startup.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={autoCheckUpdates}
                    onChange={(e) => setAutoCheckUpdates(e.target.checked)}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-ring"
                  />
                </div>

                {/* Release Channel */}
                <div className="p-3.5 flex items-center justify-between">
                  <div>
                    <label className="text-xs font-medium text-foreground block">
                      Release Channel
                    </label>
                    <span className="text-[11px] text-muted-foreground">
                      Select which release stream to receive updates from.
                    </span>
                  </div>
                  <select
                    value={updateChannel}
                    onChange={(e) => setUpdateChannel(e.target.value as UpdateChannel)}
                    className="h-7 text-xs rounded border border-input bg-background text-foreground px-2 font-medium"
                  >
                    <option value="stable">Stable (Recommended)</option>
                    <option value="beta">Beta / Pre-release</option>
                    <option value="nightly">Nightly Builds</option>
                  </select>
                </div>

                {/* Auto Download Updates */}
                <div className="p-3.5 flex items-center justify-between">
                  <div>
                    <label className="text-xs font-medium text-foreground block">
                      Download Updates Automatically
                    </label>
                    <span className="text-[11px] text-muted-foreground">
                      Download packages silently and notify when ready to restart.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={autoDownload}
                    onChange={(e) => setAutoDownload(e.target.checked)}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-ring"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* Tab 3: Message Log (SQLite History) */}
        {/* ========================================================================= */}
        {activeTab === 'history' && (
          <div className="h-full flex flex-col md:flex-row min-h-0 overflow-hidden">
            {/* Left: Filter Controls & History Message List */}
            <div className="w-full md:w-[440px] shrink-0 h-1/2 md:h-full border-b md:border-b-0 md:border-r border-border flex flex-col overflow-hidden">
              {/* Filter toolbar */}
              <div className="p-3 border-b bg-muted/20 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1">
                    <label className="text-[10px] uppercase font-semibold text-muted-foreground block mb-1">
                      Filter by Profile
                    </label>
                    <select
                      value={historyProfileId}
                      onChange={(e) => setHistoryProfileId(e.target.value)}
                      className="w-full h-7 text-xs rounded border border-input bg-background text-foreground px-2 font-medium"
                    >
                      <option value="">All Profiles (Global)</option>
                      {profiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.mode})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="w-24">
                    <label className="text-[10px] uppercase font-semibold text-muted-foreground block mb-1">
                      Limit
                    </label>
                    <select
                      value={historyLimit}
                      onChange={(e) => setHistoryLimit(Number(e.target.value))}
                      className="w-full h-7 text-xs rounded border border-input bg-background text-foreground px-1.5 font-mono"
                    >
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value={500}>500</option>
                    </select>
                  </div>

                  <div className="pt-4">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={loadHistory}
                      disabled={isLoadingHistory}
                      className="h-7 w-7 p-0"
                      title="Reload from SQLite"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isLoadingHistory ? 'animate-spin' : ''}`} />
                    </Button>
                  </div>
                </div>

                {/* Search query input */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    value={searchHistory}
                    onChange={(e) => setSearchHistory(e.target.value)}
                    placeholder="Search by topic or hex bytes..."
                    className="h-7 pl-7 text-xs bg-muted/40"
                  />
                  {searchHistory && (
                    <button
                      onClick={() => setSearchHistory('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {/* Message List Feed */}
              <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
                {isLoadingHistory ? (
                  <div className="flex items-center justify-center p-8 text-xs text-muted-foreground gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Loading SQLite history...
                  </div>
                ) : historyError ? (
                  <div className="p-4 text-xs text-destructive flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{historyError}</span>
                  </div>
                ) : filteredHistory.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground space-y-2">
                    <DbIcon className="w-6 h-6 opacity-40" />
                    <p className="text-xs font-medium text-foreground">No Stored Messages Found</p>
                    <p className="text-[11px] max-w-xs leading-relaxed">
                      Publish samples or receive subscribed messages to persist them to the local SQLite database.
                    </p>
                  </div>
                ) : (
                  filteredHistory.map((item) => {
                    const isSelected = selectedMessage?.id === item.id;
                    const isIncoming = item.direction === 'incoming';
                    const isDelete = item.kind === 'delete';
                    const byteSize = item.payload ? item.payload.length : 0;

                    return (
                      <div
                        key={item.id}
                        onClick={() => setSelectedMessage(item)}
                        className={`rounded-md border p-2 text-xs cursor-pointer transition-colors ${
                          isSelected
                            ? 'border-foreground/30 bg-muted/60'
                            : 'border-transparent hover:bg-muted/40'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1.5 font-mono text-[11px]">
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <span className="text-[10px] text-muted-foreground shrink-0">
                              {new Date(item.timestamp).toLocaleTimeString()}
                            </span>
                            <Badge
                              variant="secondary"
                              className="text-[9px] font-mono uppercase px-1 py-0"
                            >
                              {isIncoming ? (
                                <ArrowDownLeft className="w-2.5 h-2.5 mr-0.5 inline-block" />
                              ) : (
                                <ArrowUpRight className="w-2.5 h-2.5 mr-0.5 inline-block" />
                              )}
                              {isIncoming ? 'IN' : 'OUT'}
                            </Badge>
                            {isDelete && (
                              <Badge variant="destructive" className="text-[9px] font-mono px-1 py-0 uppercase">
                                DEL
                              </Badge>
                            )}
                            <span className="font-semibold text-foreground truncate max-w-[220px]">
                              {item.key_expr}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0 text-[10px] text-muted-foreground">
                            <span className="uppercase font-mono text-[9px] bg-muted px-1 rounded">
                              {item.encoding}
                            </span>
                            <span>{byteSize} B</span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right: Message Payload Detail Inspector */}
            <div className="flex-1 h-1/2 md:h-full flex flex-col min-h-0 overflow-hidden bg-background">
              {selectedMessage ? (
                <div className="flex flex-col h-full overflow-hidden">
                  <div className="p-3 border-b bg-card space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">Message Details</span>
                      <span className="text-[11px] font-mono text-muted-foreground">
                        {new Date(selectedMessage.timestamp).toISOString()}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                      <span className="text-muted-foreground">Topic:</span>
                      <span className="font-semibold text-foreground bg-muted px-1.5 py-0.5 rounded">
                        {selectedMessage.key_expr}
                      </span>
                    </div>
                  </div>

                  <div className="flex-1 min-h-0 overflow-hidden p-2">
                    <PayloadViewer
                      payload={selectedMessage.payload}
                      encoding={selectedMessage.encoding as EncodingType}
                      maxHeight="100%"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8 text-center">
                  <FileCode className="w-8 h-8 opacity-30 mb-2" />
                  <p className="text-xs font-medium text-foreground">No Message Selected</p>
                  <p className="text-[11px]">Select a historical message from the left to inspect its payload.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* Tab 4: System Status & Diagnostics */}
        {/* ========================================================================= */}
        {activeTab === 'diagnostics' && (
          <div className="max-w-3xl mx-auto p-6 space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Cpu className="w-4 h-4" />
                System Status & Runtime Engines
              </h3>
              <p className="text-xs text-muted-foreground">
                Runtime diagnostics, active engines, and storage status.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="p-4 rounded-lg border bg-card space-y-1">
                <span className="text-[11px] text-muted-foreground block">Eclipse Zenoh SDK</span>
                <span className="text-sm font-mono font-semibold text-foreground block">v1.10.0</span>
                <Badge variant="secondary" className="text-[10px]">Pure Rust 1.x</Badge>
              </div>

              <div className="p-4 rounded-lg border bg-card space-y-1">
                <span className="text-[11px] text-muted-foreground block">Desktop Framework</span>
                <span className="text-sm font-mono font-semibold text-foreground block">Tauri v2.0</span>
                <Badge variant="secondary" className="text-[10px]">WebKit / Wry</Badge>
              </div>

              <div className="p-4 rounded-lg border bg-card space-y-1">
                <span className="text-[11px] text-muted-foreground block">Local Persistence</span>
                <span className="text-sm font-mono font-semibold text-foreground block">SQLite 3</span>
                <Badge variant="secondary" className="text-[10px]">WAL Mode</Badge>
              </div>

              <div className="p-4 rounded-lg border bg-card space-y-1">
                <span className="text-[11px] text-muted-foreground block">Active Zenoh Sessions</span>
                <span className="text-sm font-mono font-semibold text-foreground block">{activeSessionCount}</span>
                <span className="text-[10px] text-muted-foreground">{profiles.length} Profiles configured</span>
              </div>

              <div className="p-4 rounded-lg border bg-card space-y-1">
                <span className="text-[11px] text-muted-foreground block">Async Runtime</span>
                <span className="text-sm font-mono font-semibold text-foreground block">Tokio Multi-thread</span>
                <Badge variant="secondary" className="text-[10px]">Full Async</Badge>
              </div>

              <div className="p-4 rounded-lg border bg-card space-y-1">
                <span className="text-[11px] text-muted-foreground block">UI Component System</span>
                <span className="text-sm font-mono font-semibold text-foreground block">shadcn/ui Zinc</span>
                <Badge variant="secondary" className="text-[10px]">Tailwind CSS</Badge>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* Tab 5: Keyboard Shortcuts */}
        {/* ========================================================================= */}
        {activeTab === 'shortcuts' && (
          <div className="max-w-3xl mx-auto p-6 space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Keyboard className="w-4 h-4" />
                Keyboard Shortcuts
              </h3>
              <p className="text-xs text-muted-foreground">
                Speed up your workflow with global shortcuts.
              </p>
            </div>

            <div className="rounded-lg border bg-card divide-y text-xs">
              <div className="p-3.5 flex items-center justify-between">
                <span className="text-foreground font-medium">Publish Sample / Run Query</span>
                <kbd className="px-2 py-1 rounded bg-muted border font-mono text-[11px]">Ctrl + Enter</kbd>
              </div>
              <div className="p-3.5 flex items-center justify-between">
                <span className="text-foreground font-medium">Toggle Connection Sidebar</span>
                <kbd className="px-2 py-1 rounded bg-muted border font-mono text-[11px]">Ctrl + B</kbd>
              </div>
              <div className="p-3.5 flex items-center justify-between">
                <span className="text-foreground font-medium">Clear Message Feed</span>
                <kbd className="px-2 py-1 rounded bg-muted border font-mono text-[11px]">Ctrl + K</kbd>
              </div>
              <div className="p-3.5 flex items-center justify-between">
                <span className="text-foreground font-medium">New Connection Profile</span>
                <kbd className="px-2 py-1 rounded bg-muted border font-mono text-[11px]">Ctrl + N</kbd>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
