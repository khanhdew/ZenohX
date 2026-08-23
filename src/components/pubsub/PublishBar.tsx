import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  Send,
  Trash2,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Loader2,
  Hash,
  Check,
  Clock,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { ResizeHandle } from '../ui/resize-handle';
import { useResizable } from '../../hooks/useResizable';
import { PayloadEditor } from '../viewer/PayloadEditor';
import { useMessageStore } from '../../stores/messageStore';
import { useConnectionStore } from '../../stores/connectionStore';
import {
  encodePayload,
  loadRecentKeys,
  saveRecentKeys,
  updateRecentKeys,
  MAX_RECENT_KEYS,
} from '../../lib/formatters';
import type { EncodingType, PutKind } from '../../types/zenoh';

export interface PublishBarProps {
  sessionId?: string;
  profileId?: string;
  defaultKeyExpr?: string;
  className?: string;
}

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
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // In-flight and debounce guard refs
  const isSendingRef = useRef<boolean>(false);
  const lastPublishTimeRef = useRef<number>(0);
  const DEBOUNCE_DELAY_MS = 400;

  // Resizable Editor Height (scale to top)
  const {
    size: editorHeight,
    isDragging: isEditorDragging,
    startDragging: startEditorDragging,
    resetToDefault: resetEditorHeight,
  } = useResizable({
    initialSize: 180,
    minSize: 100,
    maxSize: 650,
    direction: 'vertical',
    reverse: true,
    storageKey: 'zenohx_publish_editor_height',
  });

  // Key suggestions dropdown
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [recentKeys, setRecentKeys] = useState<string[]>(() => loadRecentKeys());

  // Validation
  const validation = useMemo(() => {
    if (kind === 'delete') {
      return { isValid: true, bytes: [], error: undefined };
    }
    return encodePayload(payloadText, encoding);
  }, [payloadText, encoding, kind]);

  // Publish handler
  const handlePublish = useCallback(async () => {
    const now = Date.now();
    if (isSendingRef.current || now - lastPublishTimeRef.current < DEBOUNCE_DELAY_MS) {
      return;
    }

    const trimmedKey = keyExpr.trim();
    if (!trimmedKey) {
      setErrorMessage('Key expression cannot be empty');
      return;
    }

    if (!activeSessionId) {
      setErrorMessage('Cannot publish: No active Zenoh session connected');
      return;
    }

    if (kind === 'put' && !validation.isValid) {
      setErrorMessage(`Cannot publish: ${validation.error || 'Invalid payload format'}`);
      return;
    }

    isSendingRef.current = true;
    lastPublishTimeRef.current = now;
    setIsSending(true);
    setErrorMessage(null);

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

      // Update recent keys (max 5)
      setRecentKeys((prev) => {
        const updated = updateRecentKeys(prev, trimmedKey, MAX_RECENT_KEYS);
        saveRecentKeys(updated);
        return updated;
      });

      // Turn button into green verified state for 1.5 seconds
      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
      }, 1500);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      isSendingRef.current = false;
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
      e.stopPropagation();
      handlePublish();
    }
  };

  return (
    <div
      onKeyDown={handleKeyDown}
      className={`flex flex-col border-t bg-card text-card-foreground shadow-sm transition-all ${className}`}
    >
      {/* Publisher Header & Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-muted/20 border-b">
        {/* Left: Action Kind (PUT vs DELETE) + Key Expression Input */}
        <div className="flex items-center gap-2 flex-1 min-w-[280px]">
          {/* Action Selector (PUT vs DELETE) */}
          <div className="flex items-center rounded-md border bg-muted p-0.5 text-xs shrink-0">
            <button
              type="button"
              onClick={() => setKind('put')}
              className={`rounded-sm px-2.5 py-1 text-xs font-medium transition-colors ${
                kind === 'put'
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              PUT
            </button>
            <button
              type="button"
              onClick={() => setKind('delete')}
              className={`rounded-sm px-2.5 py-1 text-xs font-medium transition-colors ${
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

            {/* Recent Keys Dropdown */}
            {showSuggestions && (
              <>
                <div
                  className="fixed inset-0 z-20"
                  onClick={() => setShowSuggestions(false)}
                />
                <div className="absolute left-0 top-full z-30 mt-1 w-full rounded-md border bg-popover p-1 shadow-md text-popover-foreground">
                  <div className="flex items-center justify-between px-2 py-1 border-b border-border/50 mb-0.5">
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase">
                      <Clock className="w-3 h-3" />
                      <span>Recent Keys</span>
                    </div>
                    {recentKeys.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setRecentKeys([]);
                          saveRecentKeys([]);
                        }}
                        className="text-[10px] text-muted-foreground hover:text-destructive transition-colors"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  {recentKeys.length === 0 ? (
                    <div className="px-2 py-2 text-xs text-muted-foreground italic text-center">
                      No recent keys
                    </div>
                  ) : (
                    recentKeys.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => {
                          setKeyExpr(s);
                          setShowSuggestions(false);
                        }}
                        className="w-full text-left px-2 py-1 text-xs font-mono rounded hover:bg-accent hover:text-accent-foreground transition-colors truncate"
                      >
                        {s}
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right: Expand/Collapse & Publish Button */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Error Message Feedback */}
          {errorMessage && (
            <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded text-[11px] max-w-[260px] truncate border bg-destructive/10 text-destructive border-destructive/20">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 text-destructive" />
              <span className="truncate">{errorMessage}</span>
            </div>
          )}

          {/* Send Sample Button */}
          <Button
            type="button"
            variant={isSuccess ? 'outline' : kind === 'delete' ? 'destructive' : 'default'}
            size="sm"
            onClick={handlePublish}
            disabled={isSending || !activeSessionId || (kind === 'put' && !validation.isValid)}
            className={`h-8 px-3 text-xs gap-1.5 font-medium transition-all duration-200 ${
              isSuccess
                ? 'bg-emerald-600 hover:bg-emerald-600 text-white border-emerald-600 shadow-xs'
                : ''
            }`}
            title="Publish sample (Ctrl+Enter)"
          >
            {isSending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Publishing...</span>
              </>
            ) : isSuccess ? (
              <>
                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>{kind === 'delete' ? 'Deleted' : 'Published'}</span>
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
            title={isExpanded ? 'Collapse editor' : 'Expand editor'}
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronUp className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Top Edge Resize Handle (when editor is expanded) */}
      {isExpanded && kind === 'put' && (
        <ResizeHandle
          direction="vertical"
          isDragging={isEditorDragging}
          onMouseDown={startEditorDragging}
          onReset={resetEditorHeight}
        />
      )}

      {/* Expanded Payload Editor Section (when kind === 'put') */}
      {isExpanded && (
        <div className="p-2.5 bg-background transition-all">
          {kind === 'delete' ? (
            <div className="flex items-center justify-center p-5 border border-dashed rounded-md text-xs text-muted-foreground bg-muted/20">
              <Trash2 className="w-4 h-4 mr-2 text-destructive" />
              <span>
                Zenoh <strong className="text-foreground">DELETE</strong> samples do not require a payload. Click "Delete Key" to remove the resource.
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
              style={{ height: `${editorHeight}px` }}
              disabled={isSending}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default PublishBar;
