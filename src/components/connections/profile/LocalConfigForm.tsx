import React from 'react';
import { Zap } from 'lucide-react';
import { Label } from '../../ui/label';
import { Input } from '../../ui/input';

export interface LocalConfigFormProps {
  localName: string;
  setLocalName: (val: string) => void;
}

export const LocalConfigForm: React.FC<LocalConfigFormProps> = ({
  localName,
  setLocalName,
}) => {
  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Profile Name */}
      <div className="space-y-1">
        <Label htmlFor="local-name" className="text-xs font-semibold">
          Profile Name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="local-name"
          value={localName}
          onChange={(e) => setLocalName(e.target.value)}
          placeholder="Local Peer"
          className="h-8 text-xs bg-background"
        />
      </div>

      {/* LAN Explanation Card */}
      <div className="rounded-lg border p-3.5 bg-muted/20 space-y-2">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-500 shrink-0" />
          <span className="text-xs font-semibold text-foreground">
            Automatic Local Discovery (P2P Peer)
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          ZenohX will automatically discover and connect to all Zenoh peers, routers, and queryables running on your local network using UDP multicast (<code className="font-mono text-[10px]">224.0.0.224:7446</code>).
        </p>
      </div>
    </div>
  );
};
