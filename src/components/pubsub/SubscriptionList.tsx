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
  Check,
  Edit2,
  Copy,
  MoreVertical,
  Code,
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
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '../ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { EditSubscriptionModal } from './EditSubscriptionModal';
import { useMessageStore } from '../../stores/messageStore';
import { useConnectionStore } from '../../stores/connectionStore';
import type { EncodingType, SubscriptionItem } from '../../types/zenoh';

export interface SubscriptionListProps {
  sessionId?: string;
  profileId?: string;
  className?: string;
}

export const SUBSCRIPTION_COLOR_PALETTE = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#84cc16', // lime
];

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

  const currentProfileId = propProfileId || selectedProfileId;
  const activeSessionId = propSessionId || getActiveSessionId(currentProfileId || undefined);

  // Filter subscriptions strictly to the active profile (or active session if no profile)
  const sessionSubscriptions = useMemo(() => {
    return subscriptions.filter((s) => {
      if (currentProfileId) {
        if (s.profileId === currentProfileId) return true;
        if (!s.profileId && activeSessionId && s.sessionId === activeSessionId) return true;
        return false;
      }
      if (activeSessionId) {
        return s.sessionId === activeSessionId || !s.sessionId;
      }
      return true;
    });
  }, [subscriptions, currentProfileId, activeSessionId]);

  // Form State for Adding Subscription
  const [showAddForm, setShowAddForm] = useState<boolean>(false);
  const [newKeyExpr, setNewKeyExpr] = useState<string>('');
  const [newEncoding, setNewEncoding] = useState<EncodingType>('json');
  const [newOrigin, setNewOrigin] = useState<string>('any');
  const [selectedColor, setSelectedColor] = useState<string>(SUBSCRIPTION_COLOR_PALETTE[0]);
  const [isSubscribing, setIsSubscribing] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState<string>('');

  // Editing & Copying State
  const [editingSub, setEditingSub] = useState<SubscriptionItem | null>(null);
  const [copiedSubId, setCopiedSubId] = useState<string | null>(null);

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

    // Check for duplicate key expression in active profile / session
    const existing = sessionSubscriptions.find((s) => s.keyExpr === key);
    if (existing) {
      setFormError(`Already subscribed to '${key}'`);
      return;
    }

    setIsSubscribing(true);
    setFormError(null);

    try {
      await subscribe(
        activeSessionId || '',
        key,
        newEncoding,
        selectedColor,
        currentProfileId || undefined,
        newOrigin !== 'any' ? { allowed_origin: newOrigin } : undefined
      );
      setNewKeyExpr('');
      setNewOrigin('any');
      // Auto cycle to next color for subsequent subscription
      const nextColorIndex = (SUBSCRIPTION_COLOR_PALETTE.indexOf(selectedColor) + 1) % SUBSCRIPTION_COLOR_PALETTE.length;
      setSelectedColor(SUBSCRIPTION_COLOR_PALETTE[nextColorIndex]);
      setShowAddForm(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubscribing(false);
    }
  };

  const handleCopyKey = (sub: SubscriptionItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (sub.keyExpr) {
      navigator.clipboard.writeText(sub.keyExpr);
      setCopiedSubId(sub.id);
      setTimeout(() => setCopiedSubId((curr) => (curr === sub.id ? null : curr)), 2000);
    }
  };

  const handleCopyJson = (sub: SubscriptionItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const exportData = {
      keyExpr: sub.keyExpr,
      encoding: sub.encoding,
      colorTag: sub.colorTag,
      active: sub.active,
      profileId: sub.profileId,
    };
    navigator.clipboard.writeText(JSON.stringify(exportData, null, 2));
    setCopiedSubId(sub.id);
    setTimeout(() => setCopiedSubId((curr) => (curr === sub.id ? null : curr)), 2000);
  };

  const handleEdit = (sub: SubscriptionItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingSub(sub);
  };

  const handleToggle = async (sub: SubscriptionItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await toggleSubscription(activeSessionId || sub.sessionId, sub.id);
    } catch (err) {
      // Handled by store
    }
  };

  const handleUnsubscribe = async (sub: SubscriptionItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await unsubscribe(activeSessionId || sub.sessionId, sub.id);
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
              disabled={!currentProfileId && !activeSessionId}
              className="h-7 px-2 text-xs gap-1"
              title={
                !currentProfileId && !activeSessionId
                  ? 'Select a profile to manage subscriptions'
                  : 'Subscribe or add a subscription preset'
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

          {/* Allowed Origin (Locality) Selector */}
          <div className="space-y-1 pt-1">
            <label className="text-[11px] font-medium text-muted-foreground">
              Allowed Origin (Locality)
            </label>
            <Select
              value={newOrigin}
              onValueChange={(val) => setNewOrigin(val)}
            >
              <SelectTrigger className="h-8 text-xs bg-background">
                <SelectValue placeholder="Origin" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any (Local & Remote)</SelectItem>
                <SelectItem value="remote">Remote Only (Network)</SelectItem>
                <SelectItem value="session_local">Local Only (This Node)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Color Palette Picker */}
          <div className="space-y-1.5 pt-1">
            <label className="text-[11px] font-medium text-muted-foreground flex items-center justify-between">
              <span>Topic Color Tag</span>
              <span className="font-mono text-[10px]" style={{ color: selectedColor }}>
                {selectedColor}
              </span>
            </label>
            <div className="flex items-center gap-1.5 flex-wrap">
              {SUBSCRIPTION_COLOR_PALETTE.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setSelectedColor(color)}
                  style={{ backgroundColor: color }}
                  className={`h-5 w-5 rounded-full transition-transform flex items-center justify-center ${
                    selectedColor === color
                      ? 'scale-110 ring-2 ring-foreground ring-offset-1 ring-offset-background'
                      : 'hover:scale-105 opacity-80 hover:opacity-100'
                  }`}
                  title={color}
                >
                  {selectedColor === color && <Check className="w-3 h-3 text-white stroke-[3]" />}
                </button>
              ))}
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
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {sessionSubscriptions.length === 0 ? (
          /* Empty Subscriptions State */
          <div className="flex flex-col items-center justify-center text-center p-5 space-y-2.5 mt-4 border border-dashed rounded-md bg-muted/20">
            <div className="p-2.5 rounded-full bg-muted text-muted-foreground">
              <Layers className="w-5 h-5" />
            </div>
            <div className="space-y-0.5">
              <p className="text-xs font-medium">
                {activeSessionId ? 'No Subscriptions' : 'No Saved Subscriptions'}
              </p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {activeSessionId
                  ? 'Subscribe to key expressions (e.g. demo/**).'
                  : 'Add key expressions to save subscription presets for this profile.'}
              </p>
            </div>
            <Button
              size="sm"
              variant="default"
              onClick={() => setShowAddForm(true)}
              disabled={!currentProfileId && !activeSessionId}
              className="h-6 px-2 text-xs gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
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
            const color = sub.colorTag || '#3b82f6';
            const isCopied = copiedSubId === sub.id;

            return (
              <ContextMenu key={sub.id}>
                <ContextMenuTrigger asChild>
                  <div
                    onClick={() => handleFilterClick(sub)}
                    style={{ borderLeftColor: color, borderLeftWidth: '3px' }}
                    className={`group relative rounded-md border p-2 transition-colors cursor-pointer select-none ${
                      isFiltered
                        ? 'border-foreground/30 bg-muted/60'
                        : 'border-transparent hover:bg-muted/40'
                    } ${!sub.active && activeSessionId ? 'opacity-50' : ''}`}
                  >
                    {/* Top Row: Key Expression + Controls */}
                    <div className="flex items-start justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <span
                          className="h-2 w-2 rounded-full shrink-0 shadow-xs"
                          style={{ backgroundColor: color }}
                        />
                        <div className="min-w-0 flex-1 truncate" title={sub.keyExpr}>
                          {renderKeyExprWithWildcards(sub.keyExpr)}
                        </div>
                      </div>

                      {/* Right Actions: Pause/Resume Toggle + 3-dots Action Menu */}
                      <div
                        className="flex items-center gap-0.5 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* Toggle Active Button */}
                        <button
                          type="button"
                          onClick={(e) => handleToggle(sub, e)}
                          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          title={
                            activeSessionId
                              ? sub.active
                                ? 'Pause subscription'
                                : 'Resume subscription'
                              : sub.active
                                ? 'Auto-subscribe on connect: enabled'
                                : 'Auto-subscribe on connect: disabled'
                          }
                        >
                          {sub.active ? (
                            <Power className="w-3 h-3 text-emerald-500" />
                          ) : (
                            <PowerOff className="w-3 h-3 text-muted-foreground" />
                          )}
                        </button>

                        {/* 3-dots Action Menu */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors opacity-60 group-hover:opacity-100"
                              title="Subscription actions"
                            >
                              <MoreVertical className="w-3 h-3" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48 text-xs">
                            <DropdownMenuItem onClick={() => handleEdit(sub)}>
                              <Edit2 className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                              <span>Edit Subscription...</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleCopyKey(sub)}>
                              {isCopied ? (
                                <Check className="w-3.5 h-3.5 mr-2 text-emerald-500" />
                              ) : (
                                <Copy className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                              )}
                              <span>Copy Key Expression</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleCopyJson(sub)}>
                              <Code className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                              <span>Copy as JSON</span>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={(e) => handleToggle(sub, e)}>
                              {sub.active ? (
                                <>
                                  <PowerOff className="w-3.5 h-3.5 mr-2 text-amber-500" />
                                  <span>
                                    {activeSessionId
                                      ? 'Pause Subscription'
                                      : 'Disable Auto-Subscribe'}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <Power className="w-3.5 h-3.5 mr-2 text-emerald-500" />
                                  <span>
                                    {activeSessionId
                                      ? 'Resume Subscription'
                                      : 'Enable Auto-Subscribe'}
                                  </span>
                                </>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleFilterClick(sub)}>
                              <Filter className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                              <span>
                                {isFiltered ? 'Clear Topic Filter' : 'Filter Feed by Topic'}
                              </span>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={(e) => handleUnsubscribe(sub, e)}
                              className="text-destructive focus:text-destructive focus:bg-destructive/10"
                            >
                              <Trash2 className="w-3.5 h-3.5 mr-2" />
                              <span>
                                {activeSessionId ? 'Unsubscribe' : 'Delete Preset'}
                              </span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    {/* Bottom Row: Metadata Badges */}
                    <div className="mt-1 flex items-center justify-between gap-1 text-[10px] text-muted-foreground">
                      <div className="flex items-center gap-1 flex-wrap">
                        {activeSessionId ? (
                          <span className="rounded bg-muted px-1 py-0.2 font-mono text-[9px]">
                            {sub.count} {sub.count === 1 ? 'msg' : 'msgs'}
                          </span>
                        ) : (
                          <span className="rounded bg-muted/60 text-muted-foreground px-1 py-0.2 text-[9px]">
                            {sub.active ? 'Auto-subscribe' : 'Paused preset'}
                          </span>
                        )}

                        <span className="rounded border px-1 py-0.2 text-[9px] uppercase font-mono">
                          {sub.encoding || 'raw'}
                        </span>

                        {sub.allowedOrigin && sub.allowedOrigin !== 'any' && (
                          <span className="rounded border bg-muted/40 px-1 py-0.2 text-[9px] font-mono capitalize">
                            {sub.allowedOrigin.replace('_', ' ')}
                          </span>
                        )}
                      </div>

                      {isFiltered && (
                        <Badge variant="outline" className="text-[9px] gap-1 px-1 py-0 font-normal">
                          <Filter className="w-2.5 h-2.5" />
                          Filtered
                        </Badge>
                      )}
                    </div>
                  </div>
                </ContextMenuTrigger>

                {/* Right-click Context Menu */}
                <ContextMenuContent className="w-48 text-xs">
                  <ContextMenuItem onClick={() => handleEdit(sub)}>
                    <Edit2 className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                    <span>Edit Subscription...</span>
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => handleCopyKey(sub)}>
                    {isCopied ? (
                      <Check className="w-3.5 h-3.5 mr-2 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                    )}
                    <span>Copy Key Expression</span>
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => handleCopyJson(sub)}>
                    <Code className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                    <span>Copy as JSON</span>
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem onClick={(e) => handleToggle(sub, e)}>
                    {sub.active ? (
                      <>
                        <PowerOff className="w-3.5 h-3.5 mr-2 text-amber-500" />
                        <span>
                          {activeSessionId
                            ? 'Pause Subscription'
                            : 'Disable Auto-Subscribe'}
                        </span>
                      </>
                    ) : (
                      <>
                        <Power className="w-3.5 h-3.5 mr-2 text-emerald-500" />
                        <span>
                          {activeSessionId
                            ? 'Resume Subscription'
                            : 'Enable Auto-Subscribe'}
                        </span>
                      </>
                    )}
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => handleFilterClick(sub)}>
                    <Filter className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                    <span>
                      {isFiltered ? 'Clear Topic Filter' : 'Filter Feed by Topic'}
                    </span>
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    onClick={(e) => handleUnsubscribe(sub, e)}
                    className="text-destructive focus:text-destructive focus:bg-destructive/10"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-2" />
                    <span>{activeSessionId ? 'Unsubscribe' : 'Delete Preset'}</span>
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
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
          {activeSessionId
            ? `${totalSamplesReceived.toLocaleString()} msgs`
            : `${sessionSubscriptions.length} saved`}
        </span>
      </div>

      {/* Edit Subscription Preset Modal */}
      <EditSubscriptionModal
        open={Boolean(editingSub)}
        onOpenChange={(open) => {
          if (!open) setEditingSub(null);
        }}
        subscription={editingSub}
        sessionId={activeSessionId}
      />
    </div>
  );
};

export default SubscriptionList;
