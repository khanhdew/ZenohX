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
      </div>
    </div>
  );
};
