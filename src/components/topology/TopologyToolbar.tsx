import React from 'react';
import {
  Search,
  Radar,
  LayoutGrid,
  Sparkles,
} from 'lucide-react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { useTopologyStore } from '../../stores/topologyStore';
import { useConnectionStore } from '../../stores/connectionStore';

export interface TopologyToolbarProps {
  onTriggerScout: () => void;
}

export const TopologyToolbar: React.FC<TopologyToolbarProps> = ({ onTriggerScout }) => {
  const nodes = useTopologyStore((s) => s.nodes);
  const searchQuery = useTopologyStore((s) => s.searchQuery);
  const filterType = useTopologyStore((s) => s.filterType);
  const layoutMode = useTopologyStore((s) => s.layoutMode);

  const setSearchQuery = useTopologyStore((s) => s.setSearchQuery);
  const setFilterType = useTopologyStore((s) => s.setFilterType);
  const setLayoutMode = useTopologyStore((s) => s.setLayoutMode);

  const isScouting = useConnectionStore((s) => s.isScouting);

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

      {/* Center: Filter tabs */}
      <div className="flex items-center rounded-md bg-muted p-0.5 text-xs">
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
          onClick={() => setFilterType('router')}
          className={`px-2.5 py-1 rounded-sm font-medium transition-colors ${
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
          className={`px-2.5 py-1 rounded-sm font-medium transition-colors ${
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
          className={`px-2.5 py-1 rounded-sm font-medium transition-colors ${
            filterType === 'connected'
              ? 'bg-background text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Active ({connectedCount})
        </button>
      </div>

      {/* Right: Layout Switcher & Scout Trigger */}
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

        <Button
          variant="outline"
          size="sm"
          onClick={onTriggerScout}
          disabled={isScouting}
          className="h-8 text-xs gap-1.5 font-medium"
        >
          <Radar className={`w-3.5 h-3.5 ${isScouting ? 'animate-spin text-primary' : ''}`} />
          <span>{isScouting ? 'Scanning...' : 'Scout LAN'}</span>
        </Button>
      </div>
    </div>
  );
};
