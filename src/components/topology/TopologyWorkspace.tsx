import React, { useState, useEffect } from 'react';
import { useConnectionStore } from '../../stores/connectionStore';
import { useTopologyStore } from '../../stores/topologyStore';
import { TopologyToolbar } from './TopologyToolbar';
import { TopologyCanvas } from './TopologyCanvas';
import { TopologyInspector } from './TopologyInspector';
import { TopologyContextMenu } from './TopologyContextMenu';
import type { TopologyNode } from '../../types/topology';
import type { ConnectionProfile } from '../../types/zenoh';

import { findMatchingProfile } from '../../lib/topology/topologyBuilder';

export interface TopologyWorkspaceProps {
  className?: string;
  onOpenProfileEditor?: (profile: ConnectionProfile) => void;
  onNavigateToPubSub?: () => void;
}

export const TopologyWorkspace: React.FC<TopologyWorkspaceProps> = ({
  className = '',
  onOpenProfileEditor,
  onNavigateToPubSub,
}) => {
  const scout = useConnectionStore((s) => s.scout);
  const connect = useConnectionStore((s) => s.connect);
  const saveProfile = useConnectionStore((s) => s.saveProfile);
  const profiles = useConnectionStore((s) => s.profiles);

  const nodes = useTopologyStore((s) => s.nodes);
  const selectedNodeId = useTopologyStore((s) => s.selectedNodeId);
  const setSelectedNodeId = useTopologyStore((s) => s.setSelectedNodeId);
  const autoScoutInterval = useTopologyStore((s) => s.autoScoutInterval);

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{
    node: TopologyNode;
    position: { x: number; y: number };
  } | null>(null);

  // Auto-scout periodic trigger and initial scan
  useEffect(() => {
    // Initial scout if no nodes scouted yet
    const currentScouted = useConnectionStore.getState().scoutedNodes;
    if (currentScouted.length === 0 && !useConnectionStore.getState().isScouting) {
      scout(2500).catch((err) => {
        console.error('Topology initial scout error:', err);
      });
    }

    if (autoScoutInterval <= 0) return;

    // Trigger immediate scout when interval is activated
    const isCurrentlyScouting = useConnectionStore.getState().isScouting;
    if (!isCurrentlyScouting) {
      scout(Math.min(2500, autoScoutInterval)).catch((err) => {
        console.error('Topology auto-scout initial error:', err);
      });
    }

    const intervalId = setInterval(() => {
      const isScoutingNow = useConnectionStore.getState().isScouting;
      if (!isScoutingNow) {
        scout(Math.min(2500, autoScoutInterval)).catch((err) => {
          console.error('Topology periodic auto-scout error:', err);
        });
      }
    }, autoScoutInterval);

    return () => clearInterval(intervalId);
  }, [autoScoutInterval, scout]);

  // Sync topology data is handled in App.tsx to ensure global state consistency

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || null;

  const handleTriggerScout = async () => {
    try {
      await scout(3000);
    } catch (err) {
      console.error('Topology scout error:', err);
    }
  };

  const handleOpenProfileEditorForNode = (node: TopologyNode) => {
    const existing = findMatchingProfile(profiles, node);
    if (existing) {
      if (onOpenProfileEditor) {
        onOpenProfileEditor(existing);
      }
      return;
    }

    const primaryLoc = node.locators[0] || '';
    const now = Date.now();
    const newProf: ConnectionProfile = {
      id: `profile-${now}`,
      name: node.label,
      mode: (node.type === 'router' ? 'client' : 'peer') as 'client' | 'peer',
      connect_locators: primaryLoc ? [primaryLoc] : [],
      listen_locators: [],
      scout_multicast: true,
      user_auth: null,
      tls_config: node.isTls ? {} : null,
      custom_config: null,
      created_at: now,
      updated_at: now,
    };
    if (onOpenProfileEditor) {
      onOpenProfileEditor(newProf);
    }
  };

  const handleConnectNode = async (node: TopologyNode) => {
    try {
      const existing = findMatchingProfile(profiles, node);
      if (existing) {
        await connect(existing.id);
        return;
      }

      const primaryLoc = node.locators[0] || '';
      const now = Date.now();
      const newProf: ConnectionProfile = {
        id: `profile-${now}`,
        name: node.label,
        mode: (node.type === 'router' ? 'client' : 'peer') as 'client' | 'peer',
        connect_locators: primaryLoc ? [primaryLoc] : [],
        listen_locators: [],
        scout_multicast: true,
        user_auth: null,
        tls_config: node.isTls ? {} : null,
        custom_config: null,
        created_at: now,
        updated_at: now,
      };
      await saveProfile(newProf);
      await connect(newProf.id);
    } catch (err) {
      console.error('Topology connect error:', err);
    }
  };

  const handleCopyZid = (node: TopologyNode) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(node.zid).catch((err) => {
        console.error('Failed to copy ZID to clipboard:', err);
      });
    }
  };

  return (
    <div className={`flex flex-col h-full w-full bg-background overflow-hidden relative ${className}`}>
      <TopologyToolbar onTriggerScout={handleTriggerScout} />

      <div className="flex-1 flex min-h-0 relative overflow-hidden">
        <TopologyCanvas
          onNodeContextMenu={(node, e) => {
            setContextMenu({
              node,
              position: { x: e.clientX, y: e.clientY },
            });
          }}
          onNodeDoubleClick={(node) => {
            if (node.type === 'router') {
              handleConnectNode(node);
            } else if (node.type === 'peer') {
              setSelectedNodeId(node.id);
            }
          }}
        />

        {selectedNode && (
          <TopologyInspector
            node={selectedNode}
            onClose={() => setSelectedNodeId(null)}
            onOpenProfileEditor={handleOpenProfileEditorForNode}
            onNavigateToPubSub={() => onNavigateToPubSub?.()}
          />
        )}
      </div>

      {contextMenu && (
        <TopologyContextMenu
          node={contextMenu.node}
          position={contextMenu.position}
          onClose={() => setContextMenu(null)}
          onConnect={handleConnectNode}
          onSaveProfile={handleOpenProfileEditorForNode}
          onCopyZid={handleCopyZid}
        />
      )}
    </div>
  );
};
