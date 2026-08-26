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

import React, { useEffect, useRef } from 'react';
import {
  Copy,
  Settings,
  Trash2,
  Play,
  BookmarkPlus,
} from 'lucide-react';
import type { TopologyNode } from '../../types/topology';
import { useConnectionStore } from '../../stores/connectionStore';
import { useTopologyStore } from '../../stores/topologyStore';
import { findMatchingProfile } from '../../lib/topology/topologyBuilder';

export interface TopologyContextMenuProps {
  node: TopologyNode;
  position: { x: number; y: number };
  onClose: () => void;
  onConnect?: (node: TopologyNode) => void;
  onSaveProfile?: (node: TopologyNode) => void;
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
  const setSelectedNodeId = useTopologyStore((s) => s.setSelectedNodeId);
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

      {onConnect && (
        <button
          type="button"
          onClick={() => {
            onConnect(node);
            onClose();
          }}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-left hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
        >
          <Play className="w-3.5 h-3.5 text-emerald-500" />
          <span>{node.status === 'connected' ? 'Disconnect Session' : 'Connect Node...'}</span>
        </button>
      )}

      {onSaveProfile && !existingProfile && node.scope === 'remote' && (
        <button
          type="button"
          onClick={() => {
            onSaveProfile(node);
            onClose();
          }}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-left hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
        >
          <BookmarkPlus className="w-3.5 h-3.5 text-blue-500" />
          <span>Save as Profile</span>
        </button>
      )}

      <button
        type="button"
        onClick={() => {
          setSelectedNodeId(node.id);
          onClose();
        }}
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-left hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
      >
        <Settings className="w-3.5 h-3.5 text-primary" />
        <span>Inspect & Rename...</span>
      </button>

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

