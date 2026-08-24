import React from 'react';
import { Cloud, Server, Share2, Check } from 'lucide-react';
import { Label } from '../../ui/label';
import { Badge } from '../../ui/badge';
import { SimpleTooltip } from '../../ui/tooltip';
import type { ConnectionPreset } from '../../../lib/tls';

export interface PresetSelectorProps {
  preset: ConnectionPreset;
  onSelectPreset: (preset: ConnectionPreset) => void;
}

interface RoleCard {
  id: ConnectionPreset;
  title: string;
  subtitle: string;
  badge: string;
  summary: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  selectedBorder: string;
  selectedBg: string;
}

const ROLES: RoleCard[] = [
  {
    id: 'router',
    title: 'Router',
    subtitle: 'Broker / Forwarder',
    badge: 'Hub / Broker',
    summary: 'Multi-transport routing hub for clients & peers.',
    icon: Server,
    iconColor: 'text-indigo-500',
    selectedBorder: 'border-indigo-500 ring-1 ring-indigo-500/30',
    selectedBg: 'bg-indigo-500/10',
  },
  {
    id: 'peer',
    title: 'Peer',
    subtitle: 'Distributed Mesh',
    badge: 'P2P Mesh',
    summary: 'P2P LAN participant with multicast & gossip discovery.',
    icon: Share2,
    iconColor: 'text-emerald-500',
    selectedBorder: 'border-emerald-500 ring-1 ring-emerald-500/30',
    selectedBg: 'bg-emerald-500/10',
  },
  {
    id: 'client',
    title: 'Client',
    subtitle: 'Lightweight Edge',
    badge: 'Edge Client',
    summary: 'Unidirectional client connecting upstream to a cloud or edge router.',
    icon: Cloud,
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
      <SimpleTooltip content="Select operating role: Router (forwarding hub), Peer (P2P mesh), or Client (edge node).">
        <Label className="text-xs font-semibold cursor-help inline-block">Zenoh Topology Role</Label>
      </SimpleTooltip>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {ROLES.map((role) => {
          const Icon = role.icon;
          const isSelected = preset === role.id;

          return (
            <SimpleTooltip key={role.id} content={role.summary} side="bottom">
              <button
                type="button"
                onClick={() => onSelectPreset(role.id)}
                className={`p-2.5 rounded-lg border text-left flex flex-col justify-between gap-1.5 transition-all cursor-pointer ${
                  isSelected
                    ? `${role.selectedBorder} ${role.selectedBg} shadow-xs`
                    : 'border-border bg-card hover:bg-muted/40'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                    <Icon className={`w-4 h-4 shrink-0 ${role.iconColor}`} />
                    {role.title}
                  </span>
                  {isSelected ? (
                    <Badge variant="default" className="text-[9px] h-4 px-1.5 gap-0.5 font-medium">
                      <Check className="w-2.5 h-2.5" />
                      Selected
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[9px] h-4 px-1.5 font-normal text-muted-foreground">
                      {role.badge}
                    </Badge>
                  )}
                </div>
                <div className="text-[11px] font-medium text-muted-foreground">
                  {role.subtitle}
                </div>
              </button>
            </SimpleTooltip>
          );
        })}
      </div>
    </div>
  );
};
