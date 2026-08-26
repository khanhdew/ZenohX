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

import React, { useState } from 'react';
import { FileCode, Copy, Check, SlidersHorizontal, Sparkles } from 'lucide-react';
import { Label } from '../../ui/label';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { SimpleTooltip } from '../../ui/tooltip';
import { useConnectionJsonStore } from '../../../stores/connectionJsonStore';

export interface RawJsonConfigSectionProps {
  customConfigText: string;
  setCustomConfigText: (val: string) => void;
  generatedConfigJson?: string;
  onApplyJson?: (json: string) => boolean;
}

export const RawJsonConfigSection: React.FC<RawJsonConfigSectionProps> = ({
  customConfigText,
  setCustomConfigText,
  generatedConfigJson,
  onApplyJson,
}) => {
  const [copied, setCopied] = useState<boolean>(false);
  const [synced, setSynced] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'preview' | 'overrides'>('preview');

  const activeEditFormJson = useConnectionJsonStore((s) => s.activeEditFormJson);
  const effectiveJson = generatedConfigJson || activeEditFormJson;

  const handleCopy = async () => {
    const textToCopy = effectiveJson || customConfigText;
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

  const handleApplyToForm = (jsonString: string) => {
    if (!jsonString || !onApplyJson) return;
    const ok = onApplyJson(jsonString);
    if (ok) {
      setSynced(true);
      setTimeout(() => setSynced(false), 2500);
    }
  };

  return (
    <div className="space-y-3 p-3.5 rounded-lg border bg-muted/10">
      <div className="flex items-center justify-between">
        <SimpleTooltip content="Real-time JSON5 configuration generated for this session and compatible with standard zenohd -c daemons.">
          <div className="flex items-center gap-1.5 cursor-pointer">
            <FileCode className="w-3.5 h-3.5 text-primary" />
            <Label className="text-xs font-semibold cursor-pointer">Configuration & JSON5 Inspection</Label>
          </div>
        </SimpleTooltip>
        <div className="flex items-center gap-1.5">
          {synced && (
            <Badge className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 gap-1 animate-in fade-in duration-150">
              <Check className="w-3 h-3" />
              Synced to Form!
            </Badge>
          )}
          <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground">
            zenohd.json5
          </Badge>
        </div>
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

        <div className="flex items-center gap-1">
          {onApplyJson && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleApplyToForm(activeTab === 'preview' ? effectiveJson : customConfigText)}
              disabled={activeTab === 'preview' ? !effectiveJson : !customConfigText.trim()}
              className="h-7 px-2 text-xs gap-1"
              title="Parse JSON5 and sync all inputs in the form above"
            >
              <Sparkles className="w-3 h-3 text-primary" />
              <span>Apply to Form</span>
            </Button>
          )}

          {activeTab === 'preview' && (effectiveJson || customConfigText) && (
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
      </div>

      {activeTab === 'preview' ? (
        <div className="relative rounded-md border bg-muted/30 p-2.5 font-mono text-[11px] leading-relaxed max-h-56 overflow-y-auto select-text text-foreground">
          <pre className="whitespace-pre font-mono">
            {effectiveJson || '{\n  // Configure options above to view live configuration\n}'}
          </pre>
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <SimpleTooltip content="Advanced low-level settings will be deep-merged directly into the Zenoh runtime config.">
              <Label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1 cursor-pointer">
                <SlidersHorizontal className="w-3 h-3" />
                <span>JSON Object Overrides</span>
              </Label>
            </SimpleTooltip>
          </div>
          <textarea
            value={customConfigText}
            onChange={(e) => setCustomConfigText(e.target.value)}
            placeholder={`{\n  "transport": {\n    "unicast": {\n      "max_sessions": 100\n    }\n  }\n}`}
            rows={5}
            className="w-full font-mono text-xs rounded-md border border-input bg-background p-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
      )}
    </div>
  );
};
