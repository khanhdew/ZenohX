import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Switch } from '../ui/switch';
import { Label } from '../ui/label';
import { useMessageStore } from '../../stores/messageStore';
import { SUBSCRIPTION_COLOR_PALETTE, renderKeyExprWithWildcards } from './SubscriptionList';
import type { EncodingType, SubscriptionItem } from '../../types/zenoh';
import { Hash, AlertCircle, Loader2, Check } from 'lucide-react';

interface EditSubscriptionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscription: SubscriptionItem | null;
  sessionId?: string;
}

export const EditSubscriptionModal: React.FC<EditSubscriptionModalProps> = ({
  open,
  onOpenChange,
  subscription,
  sessionId,
}) => {
  const updateSubscription = useMessageStore((s) => s.updateSubscription);
  const subscriptions = useMessageStore((s) => s.subscriptions);

  const [keyExpr, setKeyExpr] = useState<string>('');
  const [encoding, setEncoding] = useState<EncodingType>('json');
  const [colorTag, setColorTag] = useState<string>(SUBSCRIPTION_COLOR_PALETTE[0]);
  const [active, setActive] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (subscription && open) {
      setKeyExpr(subscription.keyExpr || '');
      setEncoding((subscription.encoding as EncodingType) || 'json');
      setColorTag(subscription.colorTag || SUBSCRIPTION_COLOR_PALETTE[0]);
      setActive(subscription.active ?? true);
      setError(null);
    }
  }, [subscription, open]);

  if (!subscription) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanKey = keyExpr.trim();
    if (!cleanKey) {
      setError('Key expression cannot be empty');
      return;
    }

    // Check for duplicate key expression among other subscriptions for the same profile
    const duplicate = subscriptions.find(
      (s) =>
        s.id !== subscription.id &&
        s.profileId === subscription.profileId &&
        s.keyExpr.toLowerCase() === cleanKey.toLowerCase()
    );
    if (duplicate) {
      setError(`Another subscription for '${cleanKey}' already exists`);
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await updateSubscription(
        subscription.id,
        {
          keyExpr: cleanKey,
          encoding,
          colorTag,
          active,
        },
        sessionId
      );
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">
              Edit Subscription Preset
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Modify the subscription topic, default encoding parser, and display tag.
            </DialogDescription>
          </DialogHeader>

          {/* Key Expression Field */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Key Expression</Label>
            <div className="relative">
              <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={keyExpr}
                onChange={(e) => setKeyExpr(e.target.value)}
                placeholder="e.g. demo/** or sensor/*"
                className="h-8 pl-8 text-xs font-mono"
                disabled={isSaving}
                autoFocus
              />
            </div>
            {keyExpr && (
              <div className="pt-0.5 text-[11px] text-muted-foreground flex items-center gap-1">
                <span>Preview:</span>
                {renderKeyExprWithWildcards(keyExpr)}
              </div>
            )}
          </div>

          {/* Encoding Field */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Default Encoding</Label>
            <Select
              value={encoding}
              onValueChange={(val) => setEncoding(val as EncodingType)}
              disabled={isSaving}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select encoding" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="json">JSON</SelectItem>
                <SelectItem value="cbor">CBOR</SelectItem>
                <SelectItem value="text">Text</SelectItem>
                <SelectItem value="raw">RAW / Hex</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Color Tag Field */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">Topic Color Tag</Label>
              <span className="font-mono text-[10px]" style={{ color: colorTag }}>
                {colorTag}
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {SUBSCRIPTION_COLOR_PALETTE.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setColorTag(color)}
                  style={{ backgroundColor: color }}
                  className={`h-5 w-5 rounded-full transition-transform flex items-center justify-center ${
                    colorTag === color
                      ? 'scale-110 ring-2 ring-foreground ring-offset-1 ring-offset-background'
                      : 'hover:scale-105 opacity-80 hover:opacity-100'
                  }`}
                  title={color}
                >
                  {colorTag === color && <Check className="w-3 h-3 text-white stroke-[3]" />}
                </button>
              ))}
            </div>
          </div>

          {/* Auto-Subscribe / Active Switch */}
          <div className="flex items-center justify-between rounded-lg border p-2.5 bg-muted/20">
            <div className="space-y-0.5">
              <Label htmlFor="auto-sub-toggle" className="text-xs font-medium cursor-pointer">
                {sessionId ? 'Active State' : 'Auto-Subscribe on Connect'}
              </Label>
              <p className="text-[11px] text-muted-foreground">
                {sessionId
                  ? 'Keep this subscription receiving packets live'
                  : 'Automatically start listening when this profile connects'}
              </p>
            </div>
            <Switch
              id="auto-sub-toggle"
              checked={active}
              onCheckedChange={setActive}
              disabled={isSaving}
            />
          </div>

          {/* Error Banner */}
          {error && (
            <div className="flex items-center gap-1.5 p-2 rounded bg-destructive/10 text-destructive text-[11px]">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{error}</span>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
              className="h-8 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSaving || !keyExpr.trim()}
              className="h-8 text-xs gap-1.5"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
