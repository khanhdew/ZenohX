import React, { useState } from 'react';
import { FileCode, Copy, Check, SlidersHorizontal } from 'lucide-react';
import { Label } from '../../ui/label';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';

export interface RawJsonConfigSectionProps {
  customConfigText: string;
  setCustomConfigText: (val: string) => void;
  generatedConfigJson?: string;
}

export const RawJsonConfigSection: React.FC<RawJsonConfigSectionProps> = ({
  customConfigText,
  setCustomConfigText,
  generatedConfigJson,
}) => {
  const [copied, setCopied] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'preview' | 'overrides'>('preview');

  const handleCopy = async () => {
    const textToCopy = generatedConfigJson || customConfigText;
    if (!textToCopy) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(textToCopy);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div className="space-y-3 p-3.5 rounded-lg border bg-muted/10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <FileCode className="w-3.5 h-3.5 text-primary" />
          <Label className="text-xs font-semibold">Configuration & JSON5 Inspection</Label>
        </div>
        <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground">
          zenohd.json5
        </Badge>
      </div>

      {/* Tabs: Live Config Preview vs Custom JSON Overrides */}
      <div className="flex items-center justify-between border-b pb-2">
        <div className="flex items-center gap-1 bg-muted/40 p-0.5 rounded-md text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('preview')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              activeTab === 'preview'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Live JSON5 Preview
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('overrides')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              activeTab === 'overrides'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Custom Overrides
          </button>
        </div>

        {activeTab === 'preview' && (generatedConfigJson || customConfigText) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
            title="Copy zenohd.json5 configuration"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-emerald-500" />
                <span className="text-emerald-600 dark:text-emerald-400">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                <span>Copy JSON5</span>
              </>
            )}
          </Button>
        )}
      </div>

      {activeTab === 'preview' ? (
        <div className="space-y-1.5">
          <div className="relative rounded-md border bg-muted/30 p-2.5 font-mono text-[11px] leading-relaxed max-h-56 overflow-y-auto select-text text-foreground">
            <pre className="whitespace-pre font-mono">
              {generatedConfigJson || '{\n  // Configure options above to view live configuration\n}'}
            </pre>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Real-time JSON5 configuration generated for this session and compatible with standard{' '}
            <code className="text-[10px] font-mono">zenohd -c</code> daemons.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
              <SlidersHorizontal className="w-3 h-3" />
              JSON Object Overrides (Merged into config)
            </Label>
          </div>
          <textarea
            value={customConfigText}
            onChange={(e) => setCustomConfigText(e.target.value)}
            placeholder={`{\n  "transport": {\n    "unicast": {\n      "max_sessions": 100\n    }\n  }\n}`}
            rows={5}
            className="w-full font-mono text-xs rounded-md border border-input bg-background p-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <p className="text-[10px] text-muted-foreground">
            Advanced low-level settings will be deep-merged directly into the Zenoh runtime config.
          </p>
        </div>
      )}
    </div>
  );
};
