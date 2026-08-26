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
import { Search, Lock, RefreshCw } from 'lucide-react';
import { Input } from '../../ui/input';
import { Button } from '../../ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';

export interface ScoutFiltersProps {
  searchQuery: string;
  setSearchQuery: (val: string) => void;
  protocolFilter: 'all' | 'tls' | 'plain';
  setProtocolFilter: (val: 'all' | 'tls' | 'plain') => void;
  totalNodeCount: number;
  timeoutMs: number;
  setTimeoutMs: (val: number) => void;
  isScouting: boolean;
  onScout: () => void;
}

export const ScoutFilters: React.FC<ScoutFiltersProps> = ({
  searchQuery,
  setSearchQuery,
  protocolFilter,
  setProtocolFilter,
  totalNodeCount,
  timeoutMs,
  setTimeoutMs,
  isScouting,
  onScout,
}) => {
  return (
    <div className="p-3 border-b bg-muted/10 flex flex-wrap items-center justify-between gap-2 text-xs">
      <div className="flex items-center gap-2">
        {/* Search Input */}
        <div className="relative w-44">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter ZID or IP..."
            className="h-7 pl-8 text-xs bg-background"
          />
        </div>

        {/* Protocol Filter Pills */}
        <div className="flex items-center rounded-md border bg-background p-0.5 text-[11px]">
          <button
            type="button"
            onClick={() => setProtocolFilter('all')}
            className={`px-2 py-0.5 rounded font-medium transition-colors ${
              protocolFilter === 'all'
                ? 'bg-muted text-foreground font-semibold shadow-2xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            All ({totalNodeCount})
          </button>
          <button
            type="button"
            onClick={() => setProtocolFilter('tls')}
            className={`px-2 py-0.5 rounded font-medium flex items-center gap-1 transition-colors ${
              protocolFilter === 'tls'
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold shadow-2xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Lock className="w-2.5 h-2.5" />
            TLS Only
          </button>
          <button
            type="button"
            onClick={() => setProtocolFilter('plain')}
            className={`px-2 py-0.5 rounded font-medium transition-colors ${
              protocolFilter === 'plain'
                ? 'bg-muted text-foreground font-semibold shadow-2xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Plain
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">Timeout:</span>
          <Select
            value={String(timeoutMs)}
            onValueChange={(val) => setTimeoutMs(Number(val))}
            disabled={isScouting}
          >
            <SelectTrigger className="h-7 w-20 text-xs font-mono">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1500" className="text-xs font-mono">1.5s</SelectItem>
              <SelectItem value="3000" className="text-xs font-mono">3.0s</SelectItem>
              <SelectItem value="5000" className="text-xs font-mono">5.0s</SelectItem>
              <SelectItem value="10000" className="text-xs font-mono">10.0s</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          variant="default"
          size="sm"
          onClick={onScout}
          disabled={isScouting}
          className="h-7 text-xs gap-1.5 font-medium"
        >
          <RefreshCw className={`w-3 h-3 ${isScouting ? 'animate-spin' : ''}`} />
          <span>{isScouting ? 'Scouting...' : 'Scan Again'}</span>
        </Button>
      </div>
    </div>
  );
};
