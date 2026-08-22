import React from 'react';
import { FileCode } from 'lucide-react';
import { Label } from '../../ui/label';

export interface RawJsonConfigSectionProps {
  customConfigText: string;
  setCustomConfigText: (val: string) => void;
}

export const RawJsonConfigSection: React.FC<RawJsonConfigSectionProps> = ({
  customConfigText,
  setCustomConfigText,
}) => {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-semibold flex items-center gap-1.5">
        <FileCode className="w-3.5 h-3.5 text-muted-foreground" />
        Custom JSON Config Overrides
      </Label>
      <textarea
        value={customConfigText}
        onChange={(e) => setCustomConfigText(e.target.value)}
        placeholder={`{\n  "transport": {\n    "unicast": {\n      "max_sessions": 100\n    }\n  }\n}`}
        rows={4}
        className="w-full font-mono text-xs rounded-md border border-input bg-background p-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
    </div>
  );
};
