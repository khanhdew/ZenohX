import React, { useState, useEffect, useMemo } from 'react';
import {
  History,
  RefreshCw,
  Sliders,
  Keyboard,
} from 'lucide-react';
import { Badge } from '../ui/badge';
import { useConnectionStore } from '../../stores/connectionStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { checkForAppUpdates, downloadAndInstallUpdate, type UpdateProgress } from '../../lib/updater';
import { APP_VERSION } from '../../lib/version';
import { queryMessages } from '../../lib/tauri';
import type { StoredMessage } from '../../types/zenoh';
import type { Update } from '@tauri-apps/plugin-updater';

import { PreferencesTab } from './tabs/PreferencesTab';
import { UpdatesTab } from './tabs/UpdatesTab';
import { HistoryTab } from './tabs/HistoryTab';
import { ShortcutsTab } from './tabs/ShortcutsTab';

export interface SettingsWorkspaceProps {
  className?: string;
}

type TabType = 'preferences' | 'updates' | 'history' | 'shortcuts';

export const SettingsWorkspace: React.FC<SettingsWorkspaceProps> = ({ className = '' }) => {
  const profiles = useConnectionStore((state) => state.profiles);
  const setLastCheckedUpdate = useSettingsStore((state) => state.setLastCheckedUpdate);

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

  // Load History on Mount or filter change
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
          version: APP_VERSION,
        });
        setUpdateSuccessNotice(`You are running the latest version of ZenohX (v${APP_VERSION}).`);
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
        {activeTab === 'preferences' && <PreferencesTab />}

        {activeTab === 'updates' && (
          <UpdatesTab
            updateState={updateState}
            availableUpdate={availableUpdate}
            updateSuccessNotice={updateSuccessNotice}
            onCheckUpdates={handleCheckUpdates}
            onInstallUpdate={handleInstallUpdate}
          />
        )}

        {activeTab === 'history' && (
          <HistoryTab
            historyProfileId={historyProfileId}
            setHistoryProfileId={setHistoryProfileId}
            historyLimit={historyLimit}
            setHistoryLimit={setHistoryLimit}
            isLoadingHistory={isLoadingHistory}
            historyError={historyError}
            searchHistory={searchHistory}
            setSearchHistory={setSearchHistory}
            filteredHistory={filteredHistory}
            selectedMessage={selectedMessage}
            setSelectedMessage={setSelectedMessage}
            onReload={loadHistory}
          />
        )}

        {activeTab === 'shortcuts' && <ShortcutsTab />}
      </main>
    </div>
  );
};

export default SettingsWorkspace;
