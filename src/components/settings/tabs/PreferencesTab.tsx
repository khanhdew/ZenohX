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
import { Moon, Sun, Laptop, Sliders, Check, ShieldCheck } from 'lucide-react';
import { Button } from '../../ui/button';
import { Switch } from '../../ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import { useSettingsStore, type CodeFont } from '../../../stores/settingsStore';
import type { EncodingType } from '../../../types/zenoh';

export const PreferencesTab: React.FC = () => {
  const {
    theme,
    compactMode,
    codeFont,
    defaultPayloadEncoding,
    maxMessageBuffer,
    defaultQueryTimeoutMs,
    anonymousTelemetry,
    setTheme,
    setCompactMode,
    setCodeFont,
    setDefaultPayloadEncoding,
    setMaxMessageBuffer,
    setDefaultQueryTimeoutMs,
    setAnonymousTelemetry,
    resetToDefaults,
  } = useSettingsStore();

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8">
      {/* Appearance Section */}
      <section className="space-y-4">
        <div>
          <h3
            className="text-sm font-semibold text-foreground flex items-center gap-2 cursor-help"
            title="Customize the interface theme and visual density."
          >
            <Moon className="w-4 h-4" />
            Appearance & Theme
          </h3>
        </div>

        {/* Theme Selector Cards */}
        <div className="grid grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => setTheme('dark')}
            className={`flex flex-col items-start p-4 rounded-xl border text-left transition-all ${
              theme === 'dark'
                ? 'border-primary bg-accent/80 ring-2 ring-primary/20 shadow-sm'
                : 'border-border bg-card hover:bg-muted/40 hover:border-muted-foreground/30'
            }`}
          >
            <div className="flex items-center justify-between w-full mb-2.5">
              <div className={`p-2 rounded-lg ${theme === 'dark' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'}`}>
                <Moon className="w-4 h-4" />
              </div>
              {theme === 'dark' && (
                <span className="flex items-center justify-center h-5 w-5 rounded-full bg-primary text-primary-foreground">
                  <Check className="w-3 h-3 stroke-[2.5]" />
                </span>
              )}
            </div>
            <span className="text-xs font-semibold text-foreground">Dark Theme</span>
          </button>

          <button
            type="button"
            onClick={() => setTheme('light')}
            className={`flex flex-col items-start p-4 rounded-xl border text-left transition-all ${
              theme === 'light'
                ? 'border-primary bg-accent/80 ring-2 ring-primary/20 shadow-sm'
                : 'border-border bg-card hover:bg-muted/40 hover:border-muted-foreground/30'
            }`}
          >
            <div className="flex items-center justify-between w-full mb-2.5">
              <div className={`p-2 rounded-lg ${theme === 'light' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'}`}>
                <Sun className="w-4 h-4" />
              </div>
              {theme === 'light' && (
                <span className="flex items-center justify-center h-5 w-5 rounded-full bg-primary text-primary-foreground">
                  <Check className="w-3 h-3 stroke-[2.5]" />
                </span>
              )}
            </div>
            <span className="text-xs font-semibold text-foreground">Light Theme</span>
          </button>

          <button
            type="button"
            onClick={() => setTheme('system')}
            className={`flex flex-col items-start p-4 rounded-xl border text-left transition-all ${
              theme === 'system'
                ? 'border-primary bg-accent/80 ring-2 ring-primary/20 shadow-sm'
                : 'border-border bg-card hover:bg-muted/40 hover:border-muted-foreground/30'
            }`}
          >
            <div className="flex items-center justify-between w-full mb-2.5">
              <div className={`p-2 rounded-lg ${theme === 'system' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'}`}>
                <Laptop className="w-4 h-4" />
              </div>
              {theme === 'system' && (
                <span className="flex items-center justify-center h-5 w-5 rounded-full bg-primary text-primary-foreground">
                  <Check className="w-3 h-3 stroke-[2.5]" />
                </span>
              )}
            </div>
            <span className="text-xs font-semibold text-foreground">System Default</span>
          </button>
        </div>

        {/* Compact Mode & Font Preferences */}
        <div className="rounded-xl border bg-card divide-y shadow-xs">
          <div className="p-4 flex items-center justify-between">
            <label
              className="text-xs font-medium text-foreground cursor-help"
              title="Tighten row heights in message streams and sidebar."
            >
              Compact Layout Mode
            </label>
            <Switch
              checked={compactMode}
              onCheckedChange={setCompactMode}
            />
          </div>

          <div className="p-4 flex items-center justify-between">
            <label
              className="text-xs font-medium text-foreground cursor-help"
              title="Font family used in Payload Viewers and Hex editors."
            >
              Payload Code Font
            </label>
            <Select value={codeFont} onValueChange={(val) => setCodeFont(val as CodeFont)}>
              <SelectTrigger className="w-48 h-8 text-xs font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mono" className="text-xs font-mono">System Monospace</SelectItem>
                <SelectItem value="jetbrains" className="text-xs font-mono">JetBrains Mono</SelectItem>
                <SelectItem value="fira" className="text-xs font-mono">Fira Code</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {/* General Protocol & Buffer Defaults */}
      <section className="space-y-4">
        <div>
          <h3
            className="text-sm font-semibold text-foreground flex items-center gap-2 cursor-help"
            title="Default encoders, query timeouts, and memory limits."
          >
            <Sliders className="w-4 h-4" />
            Protocol & Buffer Defaults
          </h3>
        </div>

        <div className="rounded-xl border bg-card divide-y shadow-xs">
          {/* Default Payload Encoding */}
          <div className="p-4 flex items-center justify-between">
            <label
              className="text-xs font-medium text-foreground cursor-help"
              title="Preselected encoder for new publish and queryable panels."
            >
              Default Payload Encoding
            </label>
            <Select
              value={defaultPayloadEncoding}
              onValueChange={(val) => setDefaultPayloadEncoding(val as EncodingType)}
            >
              <SelectTrigger className="w-36 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="json" className="text-xs">JSON</SelectItem>
                <SelectItem value="cbor" className="text-xs">CBOR</SelectItem>
                <SelectItem value="text" className="text-xs">Plain Text</SelectItem>
                <SelectItem value="raw" className="text-xs">RAW / Hex</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* In-Memory Ring Buffer Limit */}
          <div className="p-4 flex items-center justify-between">
            <label
              className="text-xs font-medium text-foreground cursor-help"
              title="Maximum live messages kept per session in RAM."
            >
              In-Memory Message Buffer
            </label>
            <Select
              value={String(maxMessageBuffer)}
              onValueChange={(val) => setMaxMessageBuffer(Number(val))}
            >
              <SelectTrigger className="w-48 h-8 text-xs font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="200" className="text-xs font-mono">200 samples</SelectItem>
                <SelectItem value="500" className="text-xs font-mono">500 samples</SelectItem>
                <SelectItem value="1000" className="text-xs font-mono">1,000 samples (Default)</SelectItem>
                <SelectItem value="5000" className="text-xs font-mono">5,000 samples</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Default Query RPC Timeout */}
          <div className="p-4 flex items-center justify-between">
            <label
              className="text-xs font-medium text-foreground cursor-help"
              title="Default wait duration for distributed query replies."
            >
              Default Query Timeout
            </label>
            <Select
              value={String(defaultQueryTimeoutMs)}
              onValueChange={(val) => setDefaultQueryTimeoutMs(Number(val))}
            >
              <SelectTrigger className="w-44 h-8 text-xs font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1000" className="text-xs font-mono">1,000ms (1.0s)</SelectItem>
                <SelectItem value="3000" className="text-xs font-mono">3,000ms (3.0s)</SelectItem>
                <SelectItem value="5000" className="text-xs font-mono">5,000ms (5.0s)</SelectItem>
                <SelectItem value="10000" className="text-xs font-mono">10,000ms (10.0s)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {/* Privacy & Analytics Section */}
      <section className="space-y-4">
        <div>
          <h3
            className="text-sm font-semibold text-foreground flex items-center gap-2 cursor-help"
            title="Manage anonymous diagnostics and active user analytics."
          >
            <ShieldCheck className="w-4 h-4" />
            Privacy & Telemetry
          </h3>
        </div>

        <div className="rounded-xl border bg-card divide-y shadow-xs">
          <div className="p-4 flex items-center justify-between gap-4">
            <label
              className="text-xs font-medium text-foreground cursor-help"
              title="Send anonymous launch metrics (OS, app version, country) to help improve ZenohX. No personal data, IP addresses, or Zenoh message payloads are ever collected."
            >
              Anonymous Usage Statistics
            </label>
            <Switch
              checked={anonymousTelemetry}
              onCheckedChange={setAnonymousTelemetry}
            />
          </div>
        </div>

        {/* Reset to Defaults button */}
        <div className="flex justify-end pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={resetToDefaults}
            className="text-xs"
          >
            Reset Preferences to Default
          </Button>
        </div>
      </section>
    </div>
  );
};
