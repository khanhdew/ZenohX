import React, { useState, useCallback, useMemo } from 'react';
import {
  Send,
  Trash2,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Hash,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { PayloadEditor } from '../viewer/PayloadEditor';
import { useMessageStore } from '../../stores/messageStore';
import { useConnectionStore } from '../../stores/connectionStore';
import { encodePayload } from '../../lib/formatters';
import type { EncodingType, PutKind } from '../../types/zenoh';

export interface PublishBarProps {
  sessionId?: string;
  profileId?: string;
  defaultKeyExpr?: string;
  className?: string;
}

const COMMON_KEY_SUGGESTIONS = [
  'demo/example/a',
  'sensor/temp',
  'sensor/humidity',
  'telemetry/drone/position',
  'cmd/robot/start',
];

export const PublishBar: React.FC<PublishBarProps> = ({
  sessionId: propSessionId,
  profileId: propProfileId,
  defaultKeyExpr = 'demo/example/a',
  className = '',
}) => {
  const { publish } = useMessageStore();
  const { getActiveSessionId, selectedProfileId } = useConnectionStore();

  const activeSessionId = propSessionId || getActiveSessionId(propProfileId || selectedProfileId || undefined);

  // Form states
  const [keyExpr, setKeyExpr] = useState<string>(defaultKeyExpr);
  const [kind, setKind] = useState<PutKind>('put');
  const [encoding, setEncoding] = useState<EncodingType>('json');
  const [payloadText, setPayloadText] = useState<string>(
    JSON.stringify(
      {
        message: 'Hello from ZenohX!',
        timestamp: Date.now(),
      },
      null,
      2
    )
  );

  // UI States
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Key suggestions dropdown
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);

  // Validation
  const validation = useMemo(() => {
    if (kind === 'delete') {
      return { isValid: true, bytes: [], error: undefined };
    }
    return encodePayload(payloadText, encoding);
  }, [payloadText, encoding, kind]);

  // Publish handler
  const handlePublish = useCallback(async () => {
    const trimmedKey = keyExpr.trim();
    if (!trimmedKey) {
      setStatusMessage({ type: 'error', text: 'Key expression cannot be empty' });
      return;
    }

    if (!activeSessionId) {
      setStatusMessage({
        type: 'error',
        text: 'Cannot publish: No active Zenoh session connected',
      });
      return;
    }

    if (kind === 'put' && !validation.isValid) {
      setStatusMessage({
        type: 'error',
        text: `Cannot publish: ${validation.error || 'Invalid payload format'}`,
      });
      return;
    }

    setIsSending(true);
    setStatusMessage(null);

    try {
      const bytesToSend = kind === 'delete' ? [] : validation.bytes;

      await publish(
        activeSessionId,
        trimmedKey,
        bytesToSend,
        encoding,
        kind,
        propProfileId || selectedProfileId || undefined
      );

      setStatusMessage({
        type: 'success',
        text: `Published sample to '${trimmedKey}' successfully`,
      });

      // Clear success feedback after 3 seconds
      setTimeout(() => {
        setStatusMessage((prev) => (prev?.type === 'success' ? null : prev));
      }, 3000);
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsSending(false);
    }
  }, [
    keyExpr,
    activeSessionId,
    kind,
    validation,
    publish,
    encoding,
    propProfileId,
    selectedProfileId,
  ]);

  // Hotkey support: Ctrl+Enter or Cmd+Enter to publish
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handlePublish();
    }
  };

  return (
    <div
      onKeyDown={handleKeyDown}
      className={`flex flex-col border-t bg-card text-card-foreground shadow-sm transition-all ${className}`}
    >
      {/* Publisher Header & Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-muted/20 border-b">
        {/* Left: Action Kind (PUT vs DELETE) + Key Expression Input */}
        <div className="flex items-center gap-2 flex-1 min-w-[280px]">
          {/* Action Selector (PUT vs DELETE) */}
          <div className="flex items-center rounded-md border bg-background p-0.5 text-xs shrink-0">
            <button
              type="button"
              onClick={() => setKind('put')}
              className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
                kind === 'put'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              PUT
            </button>
            <button
              type="button"
              onClick={() => setKind('delete')}
              className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
                kind === 'delete'
                  ? 'bg-destructive text-destructive-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              DELETE
            </button>
          </div>

          {/* Key Expression Input */}
          <div className="relative flex-1">
            <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={keyExpr}
              onChange={(e) => setKeyExpr(e.target.value)}
              onFocus={() => setShowSuggestions(true)}
              placeholder="Target key expression (e.g. demo/example/a)"
              className="h-8 pl-8 font-mono text-xs bg-background"
              disabled={isSending}
            />

            {/* Quick Suggestions Dropdown */}
            {showSuggestions && (
              <>
                <div
                  className="fixed inset-0 z-20"
                  onClick={() => setShowSuggestions(false)}
                />
                <div className="absolute left-0 top-full z-30 mt-1 w-full rounded-md border bg-popover p-1 shadow-md text-popover-foreground">
                  <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase">
                    Common Key Expressions
                  </div>
                  {COMMON_KEY_SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setKeyExpr(s);
                        setShowSuggestions(false);
                      }}
                      className="w-full text-left px-2 py-1 text-xs font-mono rounded hover:bg-accent hover:text-accent-foreground transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right: Expand/Collapse & Publish Button */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Status Message Feedback */}
          {statusMessage && (
            <div
              className={`hidden sm:flex items-center gap-1.5 px-2 py-1 rounded text-[11px] max-w-[260px] truncate ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                  : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20'
              }`}
            >
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-500" />
              )}
              <span className="truncate">{statusMessage.text}</span>
            </div>
          )}

          {/* Send Sample Button */}
          <Button
            type="button"
            variant={kind === 'delete' ? 'destructive' : 'default'}
            size="sm"
            onClick={handlePublish}
            disabled={isSending || !activeSessionId || (kind === 'put' && !validation.isValid)}
            className="h-8 px-3 text-xs gap-1.5 shadow-sm font-semibold"
            title="Publish sample (Ctrl+Enter)"
          >
            {isSending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Publishing...
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span>{kind === 'delete' ? 'Delete Key' : 'Publish Sample'}</span>
              </>
            )}
          </Button>

          {/* Collapse / Expand Toggle Button */}
          <Button
            type="button"
            variant="ghost"
            size="iconSm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            title={isExpanded ? 'Collapse payload editor' : 'Expand payload editor'}
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronUp className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Expanded Payload Editor Section (when kind === 'put') */}
      {isExpanded && (
        <div className="p-2.5 bg-background transition-all">
          {kind === 'delete' ? (
            <div className="flex items-center justify-center p-6 border border-dashed rounded-lg text-xs text-muted-foreground bg-muted/10">
              <Trash2 className="w-4 h-4 mr-2 text-destructive" />
              <span>
                Zenoh <strong className="text-foreground">DELETE</strong> samples do not require a payload body. Click "Delete Key" to remove the resource.
              </span>
            </div>
          ) : (
            <PayloadEditor
              value={payloadText}
              onChange={setPayloadText}
              encoding={encoding}
              onEncodingChange={setEncoding}
              showTemplates={true}
              showEncodingSelector={true}
              rows={4}
              disabled={isSending}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default PublishBar;
