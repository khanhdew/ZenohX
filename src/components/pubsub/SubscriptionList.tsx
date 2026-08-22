import React, { useState, useMemo } from 'react';
import {
  Plus,
  Trash2,
  Power,
  PowerOff,
  Radio,
  Filter,
  Layers,
  Sparkles,
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

const PRESET_COLORS = [
  { name: 'Blue', value: '#3b82f6', bg: 'bg-blue-500', text: 'text-blue-500' },
  { name: 'Green', value: '#10b981', bg: 'bg-emerald-500', text: 'text-emerald-500' },
  { name: 'Amber', value: '#f59e0b', bg: 'bg-amber-500', text: 'text-amber-500' },
  { name: 'Red', value: '#ef4444', bg: 'bg-rose-500', text: 'text-rose-500' },
  { name: 'Purple', value: '#8b5cf6', bg: 'bg-purple-500', text: 'text-purple-500' },
  { name: 'Pink', value: '#ec4899', bg: 'bg-pink-500', text: 'text-pink-500' },
  { name: 'Cyan', value: '#06b6d4', bg: 'bg-cyan-500', text: 'text-cyan-500' },
  { name: 'Lime', value: '#84cc16', bg: 'bg-lime-500', text: 'text-lime-500' },
];

const PRESET_KEY_EXPRS = [
  { label: 'All (demo/**)', value: 'demo/**' },
  { label: 'Sensors (sensor/**)', value: 'sensor/**' },
  { label: 'Telemetry (telemetry/*)', value: 'telemetry/*' },
  { label: 'Status (status/**)', value: 'status/**' },
];

/**
 * Highlights wildcard tokens (*, **) in a key expression.
 */
export function renderKeyExprWithWildcards(keyExpr: string) {
  const parts = keyExpr.split(/(\*\*|\*)/g);
  return (
    <span className="font-mono text-xs break-all">
      {parts.map((part, idx) => {
        if (part === '**') {
          return (
            <span
              key={idx}
              className="font-bold text-amber-500 dark:text-amber-400 bg-amber-500/10 px-1 rounded mx-0.5"
              title="Multi-chunk wildcard (**)"
            >
              **
            </span>
          );
        }
        if (part === '*') {
          return (
            <span
              key={idx}
              className="font-bold text-blue-500 dark:text-blue-400 bg-blue-500/10 px-1 rounded mx-0.5"
              title="Single-chunk wildcard (*)"
            >
              *
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
  const [selectedColor, setSelectedColor] = useState<string>(PRESET_COLORS[0].value);
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
        selectedColor,
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
      // Error handled by store
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
      // Error handled by store
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
      <div className="p-3 border-b bg-muted/20 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-primary shrink-0" />
            <span className="font-semibold text-xs tracking-tight uppercase text-foreground">
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
              className="h-7 px-2 text-xs gap-1 shadow-sm"
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
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Filter subscriptions..."
              className="h-7 pl-7 text-[11px] bg-background/80"
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
          className="p-3 border-b bg-primary/5 space-y-2.5 transition-all animate-in slide-in-from-top-2 duration-200"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold flex items-center gap-1.5 text-primary">
              <Sparkles className="w-3.5 h-3.5" />
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
                className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/50 transition-colors"
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Encoding & Color Selector Row */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            {/* Encoding Selector */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">
                Encoding
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

            {/* Color Tag Picker */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">
                Badge Color
              </label>
              <div className="flex items-center gap-1.5 h-8 px-1 rounded-md border border-input bg-background overflow-x-auto">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setSelectedColor(c.value)}
                    className={`w-4 h-4 rounded-full transition-transform shrink-0 ${c.bg} ${
                      selectedColor === c.value
                        ? 'ring-2 ring-primary ring-offset-1 scale-110'
                        : 'opacity-70 hover:opacity-100'
                    }`}
                    title={c.name}
                  />
                ))}
              </div>
            </div>
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
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {!activeSessionId ? (
          /* Disconnected State Notice */
          <div className="flex flex-col items-center justify-center text-center p-5 space-y-2 mt-4 text-muted-foreground">
            <Radio className="w-8 h-8 opacity-30 animate-pulse" />
            <p className="text-xs font-semibold text-foreground/80">
              No Active Zenoh Session
            </p>
            <p className="text-[11px] leading-relaxed max-w-[220px]">
              Connect to a Zenoh peer or router to declare subscriptions and stream samples.
            </p>
          </div>
        ) : sessionSubscriptions.length === 0 ? (
          /* Empty Subscriptions State */
          <div className="flex flex-col items-center justify-center text-center p-6 space-y-3 mt-4 border border-dashed rounded-lg bg-muted/10">
            <div className="p-3 rounded-full bg-muted/60 text-muted-foreground">
              <Layers className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold">No Subscriptions</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Subscribe to key expressions (e.g. <code className="bg-muted px-1 rounded">demo/**</code>) to capture real-time publications.
              </p>
            </div>
            <Button
              size="sm"
              variant="default"
              onClick={() => setShowAddForm(true)}
              className="h-7 text-xs gap-1 shadow-sm"
            >
              <Plus className="w-3 h-3" />
              Add Subscription
            </Button>
          </div>
        ) : displayedSubscriptions.length === 0 ? (
          <div className="text-center p-4 text-xs text-muted-foreground">
            No subscriptions matching "{searchFilter}"
          </div>
        ) : (
          displayedSubscriptions.map((sub) => {
            const isFiltered = activeFilterKey === sub.keyExpr;
            const color = sub.colorTag || '#3b82f6';
            const hasDoubleWildcard = sub.keyExpr.includes('**');
            const hasSingleWildcard = !hasDoubleWildcard && sub.keyExpr.includes('*');

            return (
              <div
                key={sub.id}
                onClick={() => handleFilterClick(sub)}
                className={`group relative rounded-lg border p-2.5 transition-all cursor-pointer select-none ${
                  isFiltered
                    ? 'border-primary bg-primary/10 shadow-sm'
                    : 'border-border bg-card/60 hover:bg-muted/40 hover:border-muted-foreground/30'
                } ${!sub.active ? 'opacity-60 bg-muted/20' : ''}`}
              >
                {/* Active Filter Color Indicator Bar */}
                <div
                  className="absolute left-0 top-2 bottom-2 w-1 rounded-r transition-all"
                  style={{ backgroundColor: color }}
                />

                {/* Top Row: Key Expression + Controls */}
                <div className="flex items-start justify-between gap-1.5 pl-1.5">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                      style={{ backgroundColor: color }}
                    />
                    <div className="min-w-0 flex-1 truncate" title={sub.keyExpr}>
                      {renderKeyExprWithWildcards(sub.keyExpr)}
                    </div>
                  </div>

                  {/* Right Actions: Pause/Resume Toggle + Delete */}
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Toggle Active Button */}
                    <button
                      type="button"
                      onClick={(e) => handleToggle(sub, e)}
                      className={`p-1 rounded transition-colors ${
                        sub.active
                          ? 'text-emerald-500 hover:bg-emerald-500/10'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                      }`}
                      title={sub.active ? 'Pause subscription' : 'Resume subscription'}
                    >
                      {sub.active ? (
                        <Power className="w-3.5 h-3.5" />
                      ) : (
                        <PowerOff className="w-3.5 h-3.5" />
                      )}
                    </button>

                    {/* Unsubscribe Button */}
                    <button
                      type="button"
                      onClick={(e) => handleUnsubscribe(sub, e)}
                      className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      title="Unsubscribe"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Bottom Row: Metadata Badges (Count, Encoding, Filter Indicator) */}
                <div className="mt-2 flex items-center justify-between gap-1 pl-1.5 text-[11px] text-muted-foreground">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* Sample Count Badge */}
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-foreground">
                      {sub.count} {sub.count === 1 ? 'sample' : 'samples'}
                    </span>

                    {/* Encoding Badge */}
                    <span className="rounded border border-border/80 px-1 py-0.2 text-[9px] uppercase font-mono">
                      {sub.encoding || 'raw'}
                    </span>

                    {/* Wildcard Type Tag */}
                    {hasDoubleWildcard ? (
                      <span className="text-[9px] font-mono text-amber-500 dark:text-amber-400 bg-amber-500/10 px-1 rounded">
                        recursive
                      </span>
                    ) : hasSingleWildcard ? (
                      <span className="text-[9px] font-mono text-blue-500 dark:text-blue-400 bg-blue-500/10 px-1 rounded">
                        wildcard
                      </span>
                    ) : null}
                  </div>

                  {/* Filter Active Badge */}
                  {isFiltered && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-primary bg-primary/15 px-1.5 py-0.5 rounded">
                      <Filter className="w-2.5 h-2.5" />
                      Filtered
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Subscriptions Footer Summary */}
      <div className="p-2.5 border-t bg-muted/20 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          {sessionSubscriptions.length} topic{sessionSubscriptions.length === 1 ? '' : 's'}
        </span>
        <span className="font-mono text-[10px]">
          Total: {totalSamplesReceived.toLocaleString()} msgs
        </span>
      </div>
    </div>
  );
};

export default SubscriptionList;
