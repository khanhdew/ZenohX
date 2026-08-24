import React, { useEffect, useRef } from 'react';
import {
  Power,
  Plus,
  Copy,
  Settings,
  Trash2,
} from 'lucide-react';
import type { TopologyNode } from '../../types/topology';
import { useConnectionStore } from '../../stores/connectionStore';
import { findMatchingProfile } from '../../lib/topology/topologyBuilder';

export interface TopologyContextMenuProps {
  node: TopologyNode;
  position: { x: number; y: number };
  onClose: () => void;
  onConnect: (node: TopologyNode) => void;
  onSaveProfile: (node: TopologyNode) => void;
  onCopyZid: (node: TopologyNode) => void;
}

export const TopologyContextMenu: React.FC<TopologyContextMenuProps> = ({
  node,
  position,
  onClose,
  onConnect,
  onSaveProfile,
  onCopyZid,
}) => {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const profiles = useConnectionStore((s) => s.profiles);
  const existingProfile = findMatchingProfile(profiles, node);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      className="fixed z-50 min-w-[180px] rounded-md border bg-popover p-1 shadow-md text-popover-foreground text-xs animate-in fade-in-80"
    >
      <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase truncate max-w-[200px]">
        {node.label}
      </div>

      <div className="h-px bg-border my-1" />

      {node.type === 'router' && (
        <button
          type="button"
          onClick={() => {
            onConnect(node);
            onClose();
          }}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-left hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
        >
          <Power className="w-3.5 h-3.5 text-emerald-500" />
          <span>Connect to Router</span>
        </button>
      )}

      {existingProfile ? (
        <button
          type="button"
          onClick={() => {
            onSaveProfile(node);
            onClose();
          }}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-left hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
          title="Node is already saved as a profile"
        >
          <Settings className="w-3.5 h-3.5 text-primary" />
          <span>Edit Saved Profile</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => {
            onSaveProfile(node);
            onClose();
          }}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-left hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5 text-primary" />
          <span>Save as Profile...</span>
        </button>
      )}

      <button
        type="button"
        onClick={() => {
          onCopyZid(node);
          onClose();
        }}
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-left hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
      >
        <Copy className="w-3.5 h-3.5 text-muted-foreground" />
        <span>Copy Zenoh ID</span>
      </button>

      {node.status !== 'connected' && (
        <>
          <div className="h-px bg-border my-1" />
          <button
            type="button"
            onClick={() => {
              if (existingProfile) {
                useConnectionStore.getState().deleteProfile(existingProfile.id);
              } else {
                useConnectionStore.getState().removeScoutedNode(node.zid);
              }
              onClose();
            }}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-left text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{existingProfile ? 'Delete Saved Profile' : 'Remove from Topology'}</span>
          </button>
        </>
      )}
    </div>
  );
};
