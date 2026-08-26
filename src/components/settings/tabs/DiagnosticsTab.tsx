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

import React from 'react';
import { Cpu } from 'lucide-react';
import { Badge } from '../../ui/badge';
import { useConnectionStore } from '../../../stores/connectionStore';

export const DiagnosticsTab: React.FC = () => {
  const { profiles, activeSessions } = useConnectionStore();
  const activeSessionCount = Object.keys(activeSessions).length;

  return (
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
  );
};
