import React, { useState, useMemo } from 'react';
import {
  Plus,
  Trash2,
  Power,
  PowerOff,
  Radio,
  Filter,
  Layers,
  AlertCircle,
  Loader2,
  Hash,
  Search,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { useMessageStore } from '../../stores/messageStore';
import { useConnectionStore } from '../../stores/connectionStore';
import type { EncodingType, SubscriptionItem } from '../../types/zenoh';

export interface SubscriptionListProps {
  sessionId?: string;
  profileId?: string;
  className?: string;
}

const PRESET_KEY_EXPRS = [
  { label: 'All (demo/**)', value: 'demo/**' },
  { label: 'Sensors (sensor/**)', value: 'sensor/**' },
  { label: 'Telemetry (telemetry/*)', value: 'telemetry/*' },
  { label: 'Status (status/**)', value: 'status/**' },
];

/**
 * Highlights wildcard tokens (*, **) in a key expression cleanly without AI neon colors.
 */
export function renderKeyExprWithWildcards(keyExpr: string) {
  const parts = keyExpr.split(/(\*\*|\*)/g);
  return (
    <span className="font-mono text-xs break-all">
      {parts.map((part, idx) => {
        if (part === '**' || part === '*') {
          return (
            <span
              key={idx}
              className="font-bold text-foreground bg-muted px-1 rounded mx-0.5"
              title={`Wildcard (${part})`}
            >
              {part}
            </span>
          );
        }
        return <span key={idx}>{part}</span>;
      })}
    </span>
  );
}

export const SubscriptionList: React.FC<SubscriptionListProps> = ({
  sessionId: propSessionId,
  profileId: propProfileId,
  className = '',
}) => {
  const {
    subscriptions,
    activeFilterKey,
    subscribe,
    unsubscribe,
    toggleSubscription,
    setActiveFilterKey,
  } = useMessageStore();

  const { getActiveSessionId, selectedProfileId } = useConnectionStore();

  const activeSessionId = propSessionId || getActiveSessionId(propProfileId || selectedProfileId || undefined);

  // Filter subscriptions to the active session if available
  const sessionSubscriptions = useMemo(() => {
    if (!activeSessionId) return subscriptions;
    return subscriptions.filter(
      (s) => !s.sessionId || s.sessionId === activeSessionId
    );
  }, [subscriptions, activeSessionId]);

  // Form State for Adding Subscription
  const [showAddForm, setShowAddForm] = useState<boolean>(false);
  const [newKeyExpr, setNewKeyExpr] = useState<string>('');
  const [newEncoding, setNewEncoding] = useState<EncodingType>('json');
  const [isSubscribing, setIsSubscribing] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState<string>('');

  // Filter subscriptions by local search
  const displayedSubscriptions = useMemo(() => {
    if (!searchFilter.trim()) return sessionSubscriptions;
    const q = searchFilter.toLowerCase().trim();
    return sessionSubscriptions.filter((s) =>
      s.keyExpr.toLowerCase().includes(q)
    );
  }, [sessionSubscriptions, searchFilter]);

  const activeSubsCount = useMemo(
    () => sessionSubscriptions.filter((s) => s.active).length,
    [sessionSubscriptions]
  );

  const totalSamplesReceived = useMemo(
    () => sessionSubscriptions.reduce((acc, curr) => acc + (curr.count || 0), 0),
    [sessionSubscriptions]
  );

  // Handlers
  const handleAddSubscription = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const key = newKeyExpr.trim();
    if (!key) {
      setFormError('Key expression cannot be empty');
      return;
    }

    if (!activeSessionId) {
      setFormError('No active Zenoh session connected');
      return;
    }

    // Check for duplicate key expression in active session
    const existing = sessionSubscriptions.find((s) => s.keyExpr === key);
    if (existing) {
      setFormError(`Already subscribed to '${key}'`);
      return;
    }

    setIsSubscribing(true);
    setFormError(null);

    try {
      await subscribe(
        activeSessionId,
        key,
        newEncoding,
        '#71717a',
        propProfileId || selectedProfileId || undefined
      );
      setNewKeyExpr('');
      setShowAddForm(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubscribing(false);
    }
  };

  const handleToggle = async (sub: SubscriptionItem, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await toggleSubscription(sub.sessionId, sub.id);
    } catch (err) {
      // Handled by store
    }
  };

  const handleUnsubscribe = async (sub: SubscriptionItem, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await unsubscribe(sub.sessionId, sub.id);
      if (activeFilterKey === sub.keyExpr) {
        setActiveFilterKey('');
      }
    } catch (err) {
      // Handled by store
    }
  };

  const handleFilterClick = (sub: SubscriptionItem) => {
    if (activeFilterKey === sub.keyExpr) {
      setActiveFilterKey('');
    } else {
      setActiveFilterKey(sub.keyExpr);
    }
  };

  return (
    <div
      className={`flex flex-col h-full bg-card text-card-foreground border-r border-border ${className}`}
    >
      {/* Panel Header */}
      <div className="p-3 border-b space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="font-semibold text-xs text-foreground">
              Subscriptions
            </span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-mono">
              {activeSubsCount}/{sessionSubscriptions.length}
            </Badge>
          </div>

          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant={showAddForm ? 'secondary' : 'default'}
              onClick={() => {
                setShowAddForm(!showAddForm);
                setFormError(null);
              }}
              disabled={!activeSessionId}
              className="h-7 px-2 text-xs gap-1"
              title={
                !activeSessionId
                  ? 'Connect to a Zenoh session to subscribe'
                  : 'Subscribe to a new key expression'
              }
            >
              <Plus className="w-3.5 h-3.5" />
              Subscribe
            </Button>
          </div>
        </div>

        {/* Search / Filter bar for subscriptions */}
        {sessionSubscriptions.length > 3 && (
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Filter topics..."
              className="h-7 pl-7 text-[11px] bg-muted/30"
            />
            {searchFilter && (
              <button
                onClick={() => setSearchFilter('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            )}
          </div>
        )}
      </div>

      {/* Add Subscription Drawer / Form */}
      {showAddForm && (
        <form
          onSubmit={handleAddSubscription}
          className="p-3 border-b bg-muted/30 space-y-2.5 transition-all"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">
              New Subscription
            </span>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              ✕
            </button>
          </div>

          {/* Key Expression Input */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">
              Key Expression
            </label>
            <div className="relative">
              <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={newKeyExpr}
                onChange={(e) => setNewKeyExpr(e.target.value)}
                placeholder="e.g. demo/** or sensor/*"
                className="h-8 pl-8 text-xs font-mono bg-background"
                autoFocus
                disabled={isSubscribing}
              />
            </div>
          </div>

          {/* Quick Preset Chips */}
          <div className="flex flex-wrap gap-1">
            {PRESET_KEY_EXPRS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => setNewKeyExpr(preset.value)}
                className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground border transition-colors"
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Encoding Selector */}
          <div className="space-y-1 pt-1">
            <label className="text-[11px] font-medium text-muted-foreground">
              Default Encoding
            </label>
            <Select
              value={newEncoding}
              onValueChange={(val) => setNewEncoding(val as EncodingType)}
            >
              <SelectTrigger className="h-8 text-xs bg-background">
                <SelectValue placeholder="Encoding" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="json">JSON</SelectItem>
                <SelectItem value="cbor">CBOR</SelectItem>
                <SelectItem value="text">Text</SelectItem>
                <SelectItem value="raw">RAW / Hex</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Form Error Banner */}
          {formError && (
            <div className="flex items-center gap-1.5 p-2 rounded bg-destructive/10 text-destructive text-[11px]">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{formError}</span>
            </div>
          )}

          {/* Submit Action Buttons */}
          <div className="flex items-center justify-end gap-1.5 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowAddForm(false)}
              disabled={isSubscribing}
              className="h-7 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubscribing || !newKeyExpr.trim()}
              className="h-7 text-xs gap-1"
            >
              {isSubscribing ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Subscribing...
                </>
              ) : (
                'Add Subscription'
              )}
            </Button>
          </div>
        </form>
      )}

      {/* Subscriptions List Container */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {!activeSessionId ? (
          /* Disconnected State Notice */
          <div className="flex flex-col items-center justify-center text-center p-5 space-y-2 mt-4 text-muted-foreground">
            <Radio className="w-6 h-6 opacity-40" />
            <p className="text-xs font-medium text-foreground">
              No Active Zenoh Session
            </p>
            <p className="text-[11px] leading-relaxed max-w-[200px]">
              Connect to a Zenoh session to declare subscriptions.
            </p>
          </div>
        ) : sessionSubscriptions.length === 0 ? (
          /* Empty Subscriptions State */
          <div className="flex flex-col items-center justify-center text-center p-5 space-y-2.5 mt-4 border border-dashed rounded-md bg-muted/20">
            <div className="p-2.5 rounded-full bg-muted text-muted-foreground">
              <Layers className="w-5 h-5" />
            </div>
            <div className="space-y-0.5">
              <p className="text-xs font-medium">No Subscriptions</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Subscribe to key expressions (e.g. <code className="bg-muted px-1 rounded">demo/**</code>).
              </p>
            </div>
            <Button
              size="sm"
              variant="default"
              onClick={() => setShowAddForm(true)}
              className="h-6 px-2 text-xs gap-1"
            >
              <Plus className="w-3 h-3" />
              Add
            </Button>
          </div>
        ) : displayedSubscriptions.length === 0 ? (
          <div className="text-center p-4 text-xs text-muted-foreground">
            No subscriptions matching "{searchFilter}"
          </div>
        ) : (
          displayedSubscriptions.map((sub) => {
            const isFiltered = activeFilterKey === sub.keyExpr;

            return (
              <div
                key={sub.id}
                onClick={() => handleFilterClick(sub)}
                className={`group rounded-md border p-2 transition-colors cursor-pointer select-none ${
                  isFiltered
                    ? 'border-foreground/30 bg-muted/60'
                    : 'border-transparent hover:bg-muted/40'
                } ${!sub.active ? 'opacity-50' : ''}`}
              >
                {/* Top Row: Key Expression + Controls */}
                <div className="flex items-start justify-between gap-1.5">
                  <div className="min-w-0 flex-1 truncate" title={sub.keyExpr}>
                    {renderKeyExprWithWildcards(sub.keyExpr)}
                  </div>

                  {/* Right Actions: Pause/Resume Toggle + Delete */}
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Toggle Active Button */}
                    <button
                      type="button"
                      onClick={(e) => handleToggle(sub, e)}
                      className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      title={sub.active ? 'Pause subscription' : 'Resume subscription'}
                    >
                      {sub.active ? (
                        <Power className="w-3 h-3 text-emerald-500" />
                      ) : (
                        <PowerOff className="w-3 h-3 text-muted-foreground" />
                      )}
                    </button>

                    {/* Unsubscribe Button */}
                    <button
                      type="button"
                      onClick={(e) => handleUnsubscribe(sub, e)}
                      className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      title="Unsubscribe"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Bottom Row: Metadata Badges */}
                <div className="mt-1 flex items-center justify-between gap-1 text-[10px] text-muted-foreground">
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="rounded bg-muted px-1 py-0.2 font-mono text-[9px]">
                      {sub.count} {sub.count === 1 ? 'msg' : 'msgs'}
                    </span>

                    <span className="rounded border px-1 py-0.2 text-[9px] uppercase font-mono">
                      {sub.encoding || 'raw'}
                    </span>
                  </div>

                  {isFiltered && (
                    <Badge variant="outline" className="text-[9px] gap-1 px-1 py-0 font-normal">
                      <Filter className="w-2.5 h-2.5" />
                      Filtered
                    </Badge>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Subscriptions Footer Summary */}
      <div className="p-2 border-t flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          {sessionSubscriptions.length} topic{sessionSubscriptions.length === 1 ? '' : 's'}
        </span>
        <span className="font-mono text-[10px]">
          {totalSamplesReceived.toLocaleString()} msgs
        </span>
      </div>
    </div>
  );
};

export default SubscriptionList;
