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

import {
  Search,
  LayoutGrid,
  Sparkles,
} from 'lucide-react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { useTopologyStore } from '../../stores/topologyStore';

export interface TopologyToolbarProps {}

export const TopologyToolbar: React.FC<TopologyToolbarProps> = () => {
  const nodes = useTopologyStore((s) => s.nodes);
  const searchQuery = useTopologyStore((s) => s.searchQuery);
  const filterType = useTopologyStore((s) => s.filterType);
  const layoutMode = useTopologyStore((s) => s.layoutMode);

  const setSearchQuery = useTopologyStore((s) => s.setSearchQuery);
  const setFilterType = useTopologyStore((s) => s.setFilterType);
  const setLayoutMode = useTopologyStore((s) => s.setLayoutMode);

  const localCount = nodes.filter((n) => n.scope === 'local').length;
  const remoteCount = nodes.filter((n) => n.scope === 'remote').length;
  const routerCount = nodes.filter((n) => n.type === 'router').length;
  const peerCount = nodes.filter((n) => n.type === 'peer').length;
  const connectedCount = nodes.filter((n) => n.status === 'connected').length;

  return (
    <div className="h-12 border-b bg-card/60 backdrop-blur-xs px-3 flex items-center justify-between gap-3 shrink-0 z-10">
      {/* Left: Search input */}
      <div className="flex items-center gap-2 flex-1 max-w-xs">
        <div className="relative w-full">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by ZID or IP:port..."
            className="h-8 pl-8 text-xs bg-background"
          />
        </div>
      </div>

      {/* Center: Scope & Filter tabs */}
      <div className="flex items-center rounded-md bg-muted p-0.5 text-xs gap-0.5">
        <button
          type="button"
          onClick={() => setFilterType('all')}
          className={`px-2.5 py-1 rounded-sm font-medium transition-colors ${
            filterType === 'all'
              ? 'bg-background text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          All ({nodes.length})
        </button>

        <button
          type="button"
          onClick={() => setFilterType('local')}
          className={`px-2.5 py-1 rounded-sm font-medium transition-colors flex items-center gap-1.5 ${
            filterType === 'local'
              ? 'bg-background text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          title="Nodes created and hosted locally by ZenohX"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span>Local ({localCount})</span>
        </button>

        <button
          type="button"
          onClick={() => setFilterType('remote')}
          className={`px-2.5 py-1 rounded-sm font-medium transition-colors flex items-center gap-1.5 ${
            filterType === 'remote'
              ? 'bg-background text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          title="Discovered network and upstream remote nodes"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
          <span>Remote ({remoteCount})</span>
        </button>

        <div className="w-[1px] h-3.5 bg-border/60 mx-0.5" />

        <button
          type="button"
          onClick={() => setFilterType('router')}
          className={`px-2 py-1 rounded-sm font-medium transition-colors ${
            filterType === 'router'
              ? 'bg-background text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Routers ({routerCount})
        </button>

        <button
          type="button"
          onClick={() => setFilterType('peer')}
          className={`px-2 py-1 rounded-sm font-medium transition-colors ${
            filterType === 'peer'
              ? 'bg-background text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Peers ({peerCount})
        </button>

        <button
          type="button"
          onClick={() => setFilterType('connected')}
          className={`px-2 py-1 rounded-sm font-medium transition-colors ${
            filterType === 'connected'
              ? 'bg-background text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Active ({connectedCount})
        </button>
      </div>

      {/* Right: Layout Switcher */}
      <div className="flex items-center gap-2">
        <div className="flex items-center rounded-md bg-muted p-0.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLayoutMode('force')}
            className={`h-7 px-2 text-xs gap-1 ${
              layoutMode === 'force' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground'
            }`}
            title="Force-Directed Dynamic Physics"
          >
            <Sparkles className="w-3 h-3" />
            <span>Force</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLayoutMode('radial')}
            className={`h-7 px-2 text-xs gap-1 ${
              layoutMode === 'radial' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground'
            }`}
            title="Radial Hub-and-Spoke Layout"
          >
            <LayoutGrid className="w-3 h-3" />
            <span>Radial</span>
          </Button>
        </div>
      </div>
    </div>
  );
};
