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

import React, { useState, useEffect, useMemo } from 'react';
import {
  History,
  RefreshCw,
  Sliders,
  Keyboard,
  FileCode2,
  Radio,
} from 'lucide-react';
import { clearMessageHistory, queryMessages } from '../../lib/tauri';
import { useUpdateStore } from '../../stores/updateStore';
import { useProtoStore } from '../../stores/protoStore';
import { useSettingsStore } from '../../stores/settingsStore';
import type { StoredMessage } from '../../types/zenoh';

import { PreferencesTab } from './tabs/PreferencesTab';
import { NetworkTab } from './tabs/NetworkTab';
import { UpdatesTab } from './tabs/UpdatesTab';
import { HistoryTab } from './tabs/HistoryTab';
import { ShortcutsTab } from './tabs/ShortcutsTab';
import { ProtobufTab } from './tabs/ProtobufTab';

export interface SettingsWorkspaceProps {
  className?: string;
}

type TabType = 'preferences' | 'network' | 'protobuf' | 'updates' | 'history' | 'shortcuts';

export const SettingsWorkspace: React.FC<SettingsWorkspaceProps> = ({ className = '' }) => {
  const [activeTab, setActiveTab] = useState<TabType>('preferences');

  const updateStatus = useUpdateStore((state) => state.status);
  const schemasCount = useProtoStore((state) => state.schemas.length);
  const mdnsEnabled = useSettingsStore((state) => state.mdnsEnabled);

  // History SQLite States
  const [historyProfileId, setHistoryProfileId] = useState<string>('');
  const [historyLimit, setHistoryLimit] = useState<number>(50);
  const [historyMessages, setHistoryMessages] = useState<StoredMessage[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<StoredMessage | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [searchHistory, setSearchHistory] = useState<string>('');

  // Load History on Mount or filter change
  useEffect(() => {
    loadHistory();
  }, [historyProfileId, historyLimit]);

  const loadHistory = async () => {
    setIsLoadingHistory(true);
    setHistoryError(null);
    try {
      const msgs = await queryMessages(historyProfileId || undefined, historyLimit, 0);
      setHistoryMessages(msgs);
      if (msgs.length > 0 && !selectedMessage) {
        setSelectedMessage(msgs[0]);
      } else if (msgs.length === 0) {
        setSelectedMessage(null);
      }
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleClearHistory = async () => {
    setIsLoadingHistory(true);
    setHistoryError(null);
    try {
      await clearMessageHistory(historyProfileId || undefined);
      setHistoryMessages([]);
      setSelectedMessage(null);
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoadingHistory(false);
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
            onClick={() => setActiveTab('network')}
            className={`inline-flex items-center gap-1.5 rounded-sm px-3 py-1 text-xs font-medium transition-colors ${
              activeTab === 'network'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Radio className="w-3.5 h-3.5 text-emerald-500" />
            <span>Network & mDNS</span>
            {mdnsEnabled && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('protobuf')}
            className={`inline-flex items-center gap-1.5 rounded-sm px-3 py-1 text-xs font-medium transition-colors ${
              activeTab === 'protobuf'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <FileCode2 className="w-3.5 h-3.5" />
            <span>Protobuf Manager</span>
            {schemasCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-primary/15 text-primary text-[10px] font-semibold">
                {schemasCount}
              </span>
            )}
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
            {(updateStatus === 'available' || updateStatus === 'downloaded') && (
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

        {activeTab === 'network' && <NetworkTab />}

        {activeTab === 'protobuf' && <ProtobufTab />}

        {activeTab === 'updates' && <UpdatesTab />}

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
            onClearHistory={handleClearHistory}
          />
        )}

        {activeTab === 'shortcuts' && <ShortcutsTab />}
      </main>
    </div>
  );
};

export default SettingsWorkspace;
