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
import { Laptop, Server, Share2, Check } from 'lucide-react';
import { Label } from '../../ui/label';
import type { ConnectionPreset } from '../../../lib/tls';

export interface PresetSelectorProps {
  preset: ConnectionPreset;
  onSelectPreset: (preset: ConnectionPreset) => void;
}

interface RoleCard {
  id: ConnectionPreset;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  selectedBorder: string;
  selectedBg: string;
}

const ROLES: RoleCard[] = [
  {
    id: 'router',
    title: 'Router',
    icon: Server,
    iconColor: 'text-indigo-500',
    selectedBorder: 'border-indigo-500 ring-1 ring-indigo-500/30',
    selectedBg: 'bg-indigo-500/10',
  },
  {
    id: 'peer',
    title: 'Peer',
    icon: Share2,
    iconColor: 'text-emerald-500',
    selectedBorder: 'border-emerald-500 ring-1 ring-emerald-500/30',
    selectedBg: 'bg-emerald-500/10',
  },
  {
    id: 'client',
    title: 'Client',
    icon: Laptop,
    iconColor: 'text-sky-500',
    selectedBorder: 'border-sky-500 ring-1 ring-sky-500/30',
    selectedBg: 'bg-sky-500/10',
  },
];

export const PresetSelector: React.FC<PresetSelectorProps> = ({
  preset,
  onSelectPreset,
}) => {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold">Zenoh Topology Role</Label>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {ROLES.map((role) => {
          const Icon = role.icon;
          const isSelected = preset === role.id;

          return (
            <button
              key={role.id}
              type="button"
              onClick={() => onSelectPreset(role.id)}
              className={`py-2.5 px-3 rounded-lg border text-left flex items-center justify-between transition-all cursor-pointer ${
                isSelected
                  ? `${role.selectedBorder} ${role.selectedBg} shadow-xs font-medium`
                  : 'border-border bg-card hover:bg-muted/40 text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className="text-xs flex items-center gap-2">
                <Icon className={`w-4 h-4 shrink-0 ${role.iconColor}`} />
                <span className={isSelected ? 'text-foreground font-semibold' : ''}>{role.title}</span>
              </span>
              {isSelected && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );
};
