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
import { Plus, Trash2, Zap, Radio, Server } from 'lucide-react';
import { Label } from '../../ui/label';
import { Input } from '../../ui/input';
import { Button } from '../../ui/button';
import type { ConnectionMode } from '../../../types/zenoh';

export interface AdvancedConfigFormProps {
  name: string;
  setName: (val: string) => void;
  mode: ConnectionMode;
  setMode: (mode: ConnectionMode) => void;
  connectLocators: string[];
  addConnectLocator: () => void;
  updateConnectLocator: (index: number, val: string) => void;
  removeConnectLocator: (index: number) => void;
  listenLocators: string[];
  addListenLocator: () => void;
  updateListenLocator: (index: number, val: string) => void;
  removeListenLocator: (index: number) => void;
}

export const AdvancedConfigForm: React.FC<AdvancedConfigFormProps> = ({
  name,
  setName,
  mode,
  setMode,
  connectLocators,
  addConnectLocator,
  updateConnectLocator,
  removeConnectLocator,
  listenLocators,
  addListenLocator,
  updateListenLocator,
  removeListenLocator,
}) => {
  return (
    <>
      {/* Profile Name */}
      <div className="space-y-1">
        <Label htmlFor="prof-name" className="text-xs font-semibold">
          Profile Name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="prof-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Custom Profile"
          className="h-8 text-xs bg-background"
        />
      </div>

      {/* Mode Selection */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold">Zenoh Operating Mode</Label>
        <div className="grid grid-cols-3 gap-2">
          {/* Peer Mode */}
          <div
            onClick={() => setMode('peer')}
            className={`cursor-pointer rounded-md border p-2.5 flex flex-col gap-1 transition-colors ${
              mode === 'peer'
                ? 'border-foreground/30 bg-muted/60'
                : 'border-border hover:bg-muted/40'
            }`}
          >
            <span className="text-xs font-semibold flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-muted-foreground" />
              Peer
            </span>
            <span className="text-[10px] text-muted-foreground">P2P peer mode</span>
          </div>

          {/* Client Mode */}
          <div
            onClick={() => setMode('client')}
            className={`cursor-pointer rounded-md border p-2.5 flex flex-col gap-1 transition-colors ${
              mode === 'client'
                ? 'border-foreground/30 bg-muted/60'
                : 'border-border hover:bg-muted/40'
            }`}
          >
            <span className="text-xs font-semibold flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-muted-foreground" />
              Client
            </span>
            <span className="text-[10px] text-muted-foreground">Upstream router</span>
          </div>

          {/* Router Mode */}
          <div
            onClick={() => setMode('router')}
            className={`cursor-pointer rounded-md border p-2.5 flex flex-col gap-1 transition-colors ${
              mode === 'router'
                ? 'border-foreground/30 bg-muted/60'
                : 'border-border hover:bg-muted/40'
            }`}
          >
            <span className="text-xs font-semibold flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-muted-foreground" />
              Router
            </span>
            <span className="text-[10px] text-muted-foreground">Route traffic</span>
          </div>
        </div>
      </div>

      {/* Connect Locators */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold">Connect Locators</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addConnectLocator}
            className="h-6 px-2 text-xs gap-1"
          >
            <Plus className="w-3 h-3" />
            Add
          </Button>
        </div>

        {connectLocators.length === 0 ? (
          <div className="rounded-md border border-dashed p-2 text-center text-xs text-muted-foreground">
            No connect locators.
          </div>
        ) : (
          <div className="space-y-1.5">
            {connectLocators.map((loc, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Input
                  value={loc}
                  onChange={(e) => updateConnectLocator(idx, e.target.value)}
                  placeholder="tcp/127.0.0.1:7447"
                  className="h-7 font-mono text-xs bg-background"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="iconSm"
                  onClick={() => removeConnectLocator(idx)}
                  className="text-muted-foreground hover:text-destructive h-7 w-7"
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Listen Locators */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold">Listen Locators</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addListenLocator}
            className="h-6 px-2 text-xs gap-1"
          >
            <Plus className="w-3 h-3" />
            Add
          </Button>
        </div>

        {listenLocators.length === 0 ? (
          <div className="rounded-md border border-dashed p-2 text-center text-xs text-muted-foreground">
            No listen locators.
          </div>
        ) : (
          <div className="space-y-1.5">
            {listenLocators.map((loc, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Input
                  value={loc}
                  onChange={(e) => updateListenLocator(idx, e.target.value)}
                  placeholder="tcp/0.0.0.0:7447"
                  className="h-7 font-mono text-xs bg-background"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="iconSm"
                  onClick={() => removeListenLocator(idx)}
                  className="text-muted-foreground hover:text-destructive h-7 w-7"
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
};
