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

import React, { useState, useMemo } from 'react';
import {
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Copy,
  Check,
  Tag,
  Clock,
  ArrowDownLeft,
  ArrowUpRight,
  Layers,
  X,
} from 'lucide-react';
import { useTrafficStore } from '../../stores/trafficStore';
import { KeyTrafficStats } from '../../types/traffic';
import { formatByteSize } from '../../lib/trafficFormatters';
import { Input } from '../ui/input';

interface KeyTrafficTableProps {
  className?: string;
}

type SortField =
  | 'keyExpr'
  | 'inboundBytes'
  | 'outboundBytes'
  | 'totalMsgs'
  | 'totalBytes'
  | 'lastSeen';

type SortDirection = 'asc' | 'desc';

function formatRelativeTime(timestamp: number): string {
  if (!timestamp) return 'Never';
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (diffSec < 2) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr}h ago`;
}

export const KeyTrafficTable: React.FC<KeyTrafficTableProps> = ({ className = '' }) => {
  const keyStats = useTrafficStore((s) => s.keyStats);
  const totalInboundBytes = useTrafficStore((s) => s.totalInboundBytes);
  const totalOutboundBytes = useTrafficStore((s) => s.totalOutboundBytes);
  const overallTotalBytes = totalInboundBytes + totalOutboundBytes;

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortField, setSortField] = useState<SortField>('totalBytes');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const handleCopy = (key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Transform and filter key stats
  const items = useMemo(() => {
    const rawList = Object.values(keyStats);
    const query = searchQuery.trim().toLowerCase();

    const filtered = query
      ? rawList.filter((item) => item.keyExpr.toLowerCase().includes(query))
      : rawList;

    return filtered.sort((a: KeyTrafficStats, b: KeyTrafficStats) => {
      const aTotalBytes = a.inboundBytes + a.outboundBytes;
      const bTotalBytes = b.inboundBytes + b.outboundBytes;
      const aTotalMsgs = a.inboundMsgs + a.outboundMsgs;
      const bTotalMsgs = b.inboundMsgs + b.outboundMsgs;

      let comparison = 0;

      switch (sortField) {
        case 'keyExpr':
          comparison = a.keyExpr.localeCompare(b.keyExpr);
          break;
        case 'inboundBytes':
          comparison = a.inboundBytes - b.inboundBytes;
          break;
        case 'outboundBytes':
          comparison = a.outboundBytes - b.outboundBytes;
          break;
        case 'totalMsgs':
          comparison = aTotalMsgs - bTotalMsgs;
          break;
        case 'totalBytes':
          comparison = aTotalBytes - bTotalBytes;
          break;
        case 'lastSeen':
          comparison = a.lastSeen - b.lastSeen;
          break;
        default:
          comparison = 0;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [keyStats, searchQuery, sortField, sortDirection]);

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 text-muted-foreground/40" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-foreground" />
    ) : (
      <ArrowDown className="w-3 h-3 text-foreground" />
    );
  };

  return (
    <div className={`flex flex-col bg-card border border-border rounded-lg shadow-xs overflow-hidden ${className}`}>
      {/* Table Toolbar: Search & Title */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 border-b border-border bg-muted/20">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-md bg-muted text-muted-foreground">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
              Topic Breakdown ({items.length})
            </h3>
            <span className="text-[11px] text-muted-foreground">
              Cumulative bandwidth and message statistics by key expression
            </span>
          </div>
        </div>

        {/* Search Input Filter */}
        <div className="relative w-64 max-w-full">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter key expressions…"
            className="h-8 pl-8 pr-8 text-xs font-mono"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Table Content */}
      <div className="flex-1 overflow-auto min-h-0">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
            <Tag className="w-8 h-8 mb-2 opacity-40 stroke-[1.5]" />
            <p className="text-sm font-medium text-foreground">
              {searchQuery ? 'No matching key expressions found' : 'No traffic recorded yet'}
            </p>
            <p className="text-xs mt-1 max-w-sm">
              {searchQuery
                ? `No topics match "${searchQuery}". Clear your search filter.`
                : 'Publish or subscribe to topics to begin tracking per-key bandwidth telemetry.'}
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-muted/40 text-muted-foreground font-medium sticky top-0 z-10 border-b border-border select-none">
              <tr>
                {/* 1. Key Expression */}
                <th
                  onClick={() => handleSort('keyExpr')}
                  className="py-2.5 px-3 cursor-pointer hover:text-foreground transition-colors min-w-[200px]"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Key Expression</span>
                    {renderSortIcon('keyExpr')}
                  </div>
                </th>

                {/* 2. Inbound Volume */}
                <th
                  onClick={() => handleSort('inboundBytes')}
                  className="py-2.5 px-3 cursor-pointer hover:text-foreground transition-colors text-right"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Inbound</span>
                    {renderSortIcon('inboundBytes')}
                  </div>
                </th>

                {/* 3. Outbound Volume */}
                <th
                  onClick={() => handleSort('outboundBytes')}
                  className="py-2.5 px-3 cursor-pointer hover:text-foreground transition-colors text-right"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Outbound</span>
                    {renderSortIcon('outboundBytes')}
                  </div>
                </th>

                {/* 4. Total Messages */}
                <th
                  onClick={() => handleSort('totalMsgs')}
                  className="py-2.5 px-3 cursor-pointer hover:text-foreground transition-colors text-right"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Messages</span>
                    {renderSortIcon('totalMsgs')}
                  </div>
                </th>

                {/* 5. Bandwidth Share Bar */}
                <th
                  onClick={() => handleSort('totalBytes')}
                  className="py-2.5 px-3 cursor-pointer hover:text-foreground transition-colors min-w-[160px]"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Share & Volume</span>
                    {renderSortIcon('totalBytes')}
                  </div>
                </th>

                {/* 6. Last Seen */}
                <th
                  onClick={() => handleSort('lastSeen')}
                  className="py-2.5 px-3 cursor-pointer hover:text-foreground transition-colors text-right"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Last Seen</span>
                    {renderSortIcon('lastSeen')}
                  </div>
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-border font-mono">
              {items.map((stat) => {
                const totalBytes = stat.inboundBytes + stat.outboundBytes;
                const totalMsgs = stat.inboundMsgs + stat.outboundMsgs;
                const sharePercent =
                  overallTotalBytes > 0
                    ? ((totalBytes / overallTotalBytes) * 100).toFixed(1)
                    : '0.0';
                const shareNum = parseFloat(sharePercent);

                return (
                  <tr
                    key={stat.keyExpr}
                    className="hover:bg-muted/30 transition-colors group"
                  >
                    {/* Key Expression */}
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-1.5 max-w-[320px] truncate">
                        <span className="font-semibold text-foreground truncate" title={stat.keyExpr}>
                          {stat.keyExpr}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => handleCopy(stat.keyExpr, e)}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-opacity"
                          title="Copy key expression"
                        >
                          {copiedKey === stat.keyExpr ? (
                            <Check className="w-3 h-3 text-emerald-500" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </td>

                    {/* Inbound Volume */}
                    <td className="py-2 px-3 text-right">
                      <div className="flex items-center justify-end gap-1 text-emerald-600 dark:text-emerald-400">
                        <ArrowDownLeft className="w-3 h-3 opacity-70 shrink-0" />
                        <span className="font-medium">{formatByteSize(stat.inboundBytes)}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {stat.inboundMsgs.toLocaleString()} msgs
                      </div>
                    </td>

                    {/* Outbound Volume */}
                    <td className="py-2 px-3 text-right">
                      <div className="flex items-center justify-end gap-1 text-sky-600 dark:text-sky-400">
                        <ArrowUpRight className="w-3 h-3 opacity-70 shrink-0" />
                        <span className="font-medium">{formatByteSize(stat.outboundBytes)}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {stat.outboundMsgs.toLocaleString()} msgs
                      </div>
                    </td>

                    {/* Total Messages */}
                    <td className="py-2 px-3 text-right font-medium text-foreground">
                      {totalMsgs.toLocaleString()}
                    </td>

                    {/* Bandwidth Share Bar */}
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-primary h-full rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(100, Math.max(shareNum, 2))}%` }}
                          />
                        </div>
                        <div className="w-12 text-right text-[11px] text-muted-foreground">
                          {sharePercent}%
                        </div>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {formatByteSize(totalBytes)} total
                      </div>
                    </td>

                    {/* Last Seen */}
                    <td className="py-2 px-3 text-right">
                      <div className="flex items-center justify-end gap-1 text-muted-foreground text-[11px]">
                        <Clock className="w-3 h-3 opacity-60" />
                        <span>{formatRelativeTime(stat.lastSeen)}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default KeyTrafficTable;
