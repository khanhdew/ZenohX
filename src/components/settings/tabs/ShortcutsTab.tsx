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
import { Keyboard } from 'lucide-react';

export const ShortcutsTab: React.FC = () => {
  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Keyboard className="w-4 h-4" />
          Keyboard Shortcuts
        </h3>
        <p className="text-xs text-muted-foreground">
          Speed up your workflow with global shortcuts.
        </p>
      </div>

      <div className="rounded-lg border bg-card divide-y text-xs">
        <div className="p-3.5 flex items-center justify-between">
          <span className="text-foreground font-medium">Publish Sample / Run Query</span>
          <kbd className="px-2 py-1 rounded bg-muted border font-mono text-[11px]">Ctrl + Enter</kbd>
        </div>
        <div className="p-3.5 flex items-center justify-between">
          <span className="text-foreground font-medium">Toggle Connection Sidebar</span>
          <kbd className="px-2 py-1 rounded bg-muted border font-mono text-[11px]">Ctrl + B</kbd>
        </div>
        <div className="p-3.5 flex items-center justify-between">
          <span className="text-foreground font-medium">Clear Message Feed</span>
          <kbd className="px-2 py-1 rounded bg-muted border font-mono text-[11px]">Ctrl + K</kbd>
        </div>
        <div className="p-3.5 flex items-center justify-between">
          <span className="text-foreground font-medium">New Connection Profile</span>
          <kbd className="px-2 py-1 rounded bg-muted border font-mono text-[11px]">Ctrl + N</kbd>
        </div>
        <div className="p-3.5 flex items-center justify-between">
          <span className="text-foreground font-medium">Open Protobuf Schema Manager</span>
          <kbd className="px-2 py-1 rounded bg-muted border font-mono text-[11px]">Ctrl + Shift + P</kbd>
        </div>
      </div>
    </div>
  );
};
