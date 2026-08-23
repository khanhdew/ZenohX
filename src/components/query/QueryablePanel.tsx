import React, { useState, useMemo } from 'react';
import {
  Server,
  Plus,
  Trash2,
  Send,
  Sparkles,
  Inbox,
  Clock,
  AlertCircle,
  ToggleLeft,
  ToggleRight,
  X,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '../ui/select';
import { PayloadEditor } from '../viewer/PayloadEditor';
import { PayloadViewer } from '../viewer/PayloadViewer';
import { useQueryStore } from '../../stores/queryStore';
import { formatTimeWithMs, formatByteSize, encodePayload } from '../../lib/formatters';
import type { EncodingType, InboundQuery, ActiveQueryable } from '../../types/zenoh';

export interface QueryablePanelProps {
  sessionId?: string;
  profileId?: string;
  className?: string;
}

export interface MockTemplate {
  name: string;
  encoding: EncodingType;
  content: string;
  description: string;
}

export const MOCK_RESPONSE_TEMPLATES: MockTemplate[] = [
  {
    name: 'Calculator Result (JSON)',
    encoding: 'json',
    content: JSON.stringify({ result: 42, operation: 'add', status: 'success' }, null, 2),
    description: 'JSON RPC answer with computation output',
  },
  {
    name: 'Sensor Status (JSON)',
    encoding: 'json',
    content: JSON.stringify(
      {
        temperature: 24.5,
        humidity: 60.2,
        battery: 98,
        unit: 'celsius',
        timestamp: Date.now(),
      },
      null,
      2
    ),
    description: 'Mock telemetry data reply',
  },
  {
    name: 'Simple OK (Text)',
    encoding: 'text',
    content: 'OK: Command processed successfully',
    description: 'Plain text ACK response',
  },
  {
    name: 'Binary Hex Dump (Raw)',
    encoding: 'raw',
    content: '0x01 0x02 0x03 0x04 0xAA 0xBB 0xCC 0xDD',
    description: 'Raw binary byte payload',
  },
];

export const QueryablePanel: React.FC<QueryablePanelProps> = ({
  sessionId,
  profileId,
  className = '',
}) => {
  const {
    activeQueryables,
    inboundQueries,
    declareQueryable,
    undeclareQueryable,
    replyInboundQuery,
    clearInboundQueries,
    updateQueryableConfig,
    error: storeError,
  } = useQueryStore();

  // Form State: Declare Queryable
  const [keyExpr, setKeyExpr] = useState<string>('rpc/calculator/**');
  const [autoReply, setAutoReply] = useState<boolean>(true);
  const [replyEncoding, setReplyEncoding] = useState<EncodingType>('json');
  const [replyPayload, setReplyPayload] = useState<string>(
    MOCK_RESPONSE_TEMPLATES[0].content
  );
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Manual Inbound Query Responder State
  const [activeReplyQuery, setActiveReplyQuery] = useState<InboundQuery | null>(null);
  const [manualReplyEncoding, setManualReplyEncoding] = useState<EncodingType>('json');
  const [manualReplyPayload, setManualReplyPayload] = useState<string>(
    JSON.stringify({ status: 'ok', processed_at: Date.now() }, null, 2)
  );
  const [isSendingManualReply, setIsSendingManualReply] = useState<boolean>(false);
  const [manualReplyError, setManualReplyError] = useState<string | null>(null);

  // Filter queryables & inbound queries for current session / profile
  const sessionQueryables = useMemo(() => {
    return activeQueryables.filter((q) => {
      if (profileId && q.profileId && q.profileId !== profileId) return false;
      if (sessionId && q.sessionId && q.sessionId !== sessionId) return false;
      return true;
    });
  }, [activeQueryables, profileId, sessionId]);

  const sessionInboundQueries = useMemo(() => {
    if (!sessionId) return inboundQueries;
    return inboundQueries.filter((q) => !q.session_id || q.session_id === sessionId);
  }, [inboundQueries, sessionId]);

  // Declare Queryable Handler
  const handleDeclare = async () => {
    const cleanKey = keyExpr.trim();
    if (!cleanKey) {
      setFormError('Key expression cannot be empty');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      await declareQueryable(
        sessionId || '',
        cleanKey,
        autoReply,
        replyPayload,
        replyEncoding,
        profileId
      );
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Undeclare Queryable Handler
  const handleUndeclare = async (queryableId: string) => {
    try {
      await undeclareQueryable(sessionId || '', queryableId);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    }
  };

  // Send Manual Inbound Reply Handler
  const handleSendManualReply = async () => {
    if (!activeReplyQuery) return;

    setManualReplyError(null);
    setIsSendingManualReply(true);

    try {
      const encoded = encodePayload(manualReplyPayload, manualReplyEncoding);
      if (!encoded.isValid) {
        throw new Error(encoded.error || 'Invalid payload encoding syntax');
      }

      await replyInboundQuery(
        activeReplyQuery.token,
        activeReplyQuery.key_expr,
        encoded.bytes,
        manualReplyEncoding
      );

      setActiveReplyQuery(null);
    } catch (err) {
      setManualReplyError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSendingManualReply(false);
    }
  };

  return (
    <div className={`flex flex-col h-full bg-background text-foreground overflow-hidden ${className}`}>
      {/* Top Header Bar */}
      <div className="flex flex-wrap items-center justify-between border-b bg-card px-4 py-2.5 shrink-0 gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-md bg-muted text-muted-foreground">
            <Server className="w-3.5 h-3.5" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-foreground">
              Queryable Simulator
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Register distributed RPC endpoints and automate mock query responses
            </p>
          </div>
        </div>

        {/* Inbound Queries Counter Badge */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-muted px-2.5 py-1 rounded-md text-xs">
            <Inbox className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="font-medium text-foreground">Inbound Queue:</span>
            <span className="font-mono px-1 rounded text-[11px] bg-background text-foreground border">
              {sessionInboundQueries.length}
            </span>
          </div>

          {sessionInboundQueries.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => clearInboundQueries(sessionId)}
              className="h-7 text-xs px-2 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="w-3 h-3 mr-1" />
              Clear Queue
            </Button>
          )}
        </div>
      </div>

      {/* Main Stage Grid: 2 Column Layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 min-h-0 divide-y lg:divide-y-0 lg:divide-x divide-border overflow-hidden">
        {/* Left Column: Register Queryable Form + Active Queryables List */}
        <div className="flex flex-col h-full overflow-y-auto p-3.5 space-y-3.5 bg-card/40">
          {/* Error notification */}
          {(formError || storeError) && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 p-2.5 text-xs text-destructive">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-semibold">Queryable Error:</span>
                <p className="mt-0.5 break-all">{formError || storeError}</p>
              </div>
              <button
                type="button"
                onClick={() => setFormError(null)}
                className="text-destructive hover:opacity-70"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Form: Declare New Queryable */}
          <div className="rounded-md border bg-card p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">
                Declare New Queryable
              </span>
              <Badge variant="secondary" className="text-[10px] font-mono uppercase">
                RPC Provider
              </Badge>
            </div>

            {/* Key Expression */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">
                Key Expression
              </label>
              <Input
                type="text"
                value={keyExpr}
                onChange={(e) => setKeyExpr(e.target.value)}
                placeholder="e.g. rpc/calculator/** or demo/sensor/*"
                disabled={isSubmitting}
                className="font-mono text-xs h-8 bg-background"
              />
            </div>

            {/* Auto-Reply Switch */}
            <div className="flex items-center justify-between rounded-md border bg-muted/20 p-2">
              <div>
                <div className="text-xs font-medium text-foreground">
                  Automated Mock Reply
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Automatically send response when query matches
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAutoReply(!autoReply)}
                className="text-foreground transition-opacity"
              >
                {autoReply ? (
                  <ToggleRight className="w-6 h-6 text-foreground" />
                ) : (
                  <ToggleLeft className="w-6 h-6 text-muted-foreground" />
                )}
              </button>
            </div>

            {/* Mock Response Payload Editor */}
            {autoReply && (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-medium text-muted-foreground">
                    Mock Response Payload
                  </label>
                  {/* Template selector */}
                  <Select
                    onValueChange={(val) => {
                      const tmpl = MOCK_RESPONSE_TEMPLATES.find((t) => t.name === val);
                      if (tmpl) {
                        setReplyPayload(tmpl.content);
                        setReplyEncoding(tmpl.encoding);
                      }
                    }}
                  >
                    <SelectTrigger className="h-6 text-[10px] px-2 gap-1 bg-background border-muted w-32">
                      <Sparkles className="w-3 h-3 mr-1 text-muted-foreground" />
                      <span>Mock Presets</span>
                    </SelectTrigger>
                    <SelectContent align="end">
                      {MOCK_RESPONSE_TEMPLATES.map((tmpl) => (
                        <SelectItem key={tmpl.name} value={tmpl.name} className="text-xs">
                          <div>
                            <span className="font-medium text-foreground block">{tmpl.name}</span>
                            <span className="text-[10px] text-muted-foreground">{tmpl.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <PayloadEditor
                  value={replyPayload}
                  onChange={setReplyPayload}
                  encoding={replyEncoding}
                  onEncodingChange={setReplyEncoding}
                  rows={4}
                />
              </div>
            )}

            {/* Submit Button */}
            <Button
              type="button"
              onClick={handleDeclare}
              disabled={isSubmitting || !sessionId || !keyExpr.trim()}
              className="w-full h-8 font-medium gap-1.5"
              variant="default"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Declare Queryable</span>
            </Button>
          </div>

          {/* Active Queryables List */}
          <div className="space-y-2 pt-1">
            <span className="text-xs font-semibold text-muted-foreground">
              Active Declared Queryables ({sessionQueryables.length})
            </span>

            {sessionQueryables.length === 0 ? (
              <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground bg-muted/10">
                <Server className="w-6 h-6 mx-auto text-muted-foreground/40 mb-1.5" />
                <p className="font-medium text-foreground">No Queryables Declared</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Declare a key expression above to start responding to RPC queries.
                </p>
              </div>
            ) : (
              sessionQueryables.map((q: ActiveQueryable) => (
                <div
                  key={q.id}
                  className="flex flex-col gap-1.5 rounded-md border bg-card p-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      <span className="font-mono text-xs font-medium text-foreground truncate">
                        {q.keyExpr}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          updateQueryableConfig(q.id, { autoReply: !q.autoReply })
                        }
                        className="text-xs flex items-center gap-1"
                        title={q.autoReply ? 'Disable auto-reply' : 'Enable auto-reply'}
                      >
                        {q.autoReply ? (
                          <Badge variant="secondary" className="text-[9px] px-1 py-0 uppercase">
                            Auto ON
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 uppercase">
                            Manual
                          </Badge>
                        )}
                      </button>

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleUndeclare(q.id)}
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                        title="Undeclare queryable"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Auto-reply payload preview */}
                  {q.autoReply && q.replyPayload && (
                    <div className="font-mono text-[10px] text-muted-foreground bg-muted/40 p-1.5 rounded border truncate">
                      <span className="font-medium uppercase text-foreground mr-1">
                        [{q.replyEncoding || 'json'}]
                      </span>
                      {q.replyPayload.replace(/[\r\n\t ]+/g, ' ')}
                    </div>
                  )}

                  <div className="text-[10px] text-muted-foreground font-mono">
                    Declared at {formatTimeWithMs(q.createdAt)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Column: Inbound Queries Queue & Manual Responder */}
        <div className="flex flex-col h-full overflow-y-auto p-3.5 space-y-3.5 bg-card/20">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-semibold text-foreground">
                Inbound Queries Stream
              </h4>
              <p className="text-[11px] text-muted-foreground">
                Live queue of queries received from remote nodes awaiting response
              </p>
            </div>
            <span className="font-mono text-xs text-muted-foreground">
              {sessionInboundQueries.length} pending
            </span>
          </div>

          {/* List of Inbound Queries */}
          {sessionInboundQueries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center p-5 border border-dashed rounded-md bg-muted/10">
              <Inbox className="w-8 h-8 text-muted-foreground/40 mb-2" />
              <h5 className="text-xs font-medium text-foreground">
                No Pending Inbound Queries
              </h5>
              <p className="text-[11px] text-muted-foreground max-w-sm mt-0.5">
                Incoming queries to your declared key expressions will appear here in real-time.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {sessionInboundQueries.map((inbound: InboundQuery) => {
                const isReplying = activeReplyQuery?.token === inbound.token;

                return (
                  <div
                    key={inbound.token}
                    className={`rounded-md border p-3 space-y-2 transition-colors ${
                      isReplying
                        ? 'border-foreground/30 bg-muted/60'
                        : 'border-border bg-card hover:bg-muted/30'
                    }`}
                  >
                    {/* Header: Key Expression, Parameters, Time */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 truncate">
                        <Badge variant="secondary" className="text-[9px] uppercase font-mono px-1 py-0">
                          Query
                        </Badge>
                        <span className="font-mono text-xs font-medium text-foreground truncate">
                          {inbound.key_expr}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatTimeWithMs(inbound.timestamp)}
                        </span>

                        <Button
                          type="button"
                          size="sm"
                          variant={isReplying ? 'secondary' : 'default'}
                          onClick={() => {
                            if (isReplying) {
                              setActiveReplyQuery(null);
                            } else {
                              setActiveReplyQuery(inbound);
                            }
                          }}
                          className="h-6 text-xs px-2 gap-1"
                        >
                          <Send className="w-3 h-3" />
                          <span>{isReplying ? 'Cancel' : 'Reply'}</span>
                        </Button>
                      </div>
                    </div>

                    {/* Parameters if any */}
                    {inbound.parameters && (
                      <div className="font-mono text-xs bg-muted/40 p-1.5 rounded border text-muted-foreground">
                        <span className="font-medium text-foreground mr-1">Query Params:</span>
                        <span className="text-foreground">{inbound.parameters}</span>
                      </div>
                    )}

                    {/* Query Payload if incoming query has body */}
                    {inbound.payload && inbound.payload.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-[10px] uppercase font-medium text-muted-foreground">
                          Payload ({formatByteSize(inbound.payload.length)})
                        </div>
                        <PayloadViewer
                          payload={inbound.payload}
                          encoding={inbound.encoding || 'json'}
                          maxHeight="160px"
                          showMetrics={false}
                        />
                      </div>
                    )}

                    {/* Active Manual Reply Composer Box */}
                    {isReplying && (
                      <div className="pt-2 border-t space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-foreground flex items-center gap-1">
                            <Send className="w-3.5 h-3.5 text-muted-foreground" />
                            <span>Craft Response</span>
                          </span>

                          <div className="flex items-center gap-1">
                            <Select
                              onValueChange={(val) => {
                                const tmpl = MOCK_RESPONSE_TEMPLATES.find((t) => t.name === val);
                                if (tmpl) {
                                  setManualReplyPayload(tmpl.content);
                                  setManualReplyEncoding(tmpl.encoding);
                                }
                              }}
                            >
                              <SelectTrigger className="h-6 text-[10px] px-1.5 bg-background border-muted">
                                <Sparkles className="w-3 h-3 text-muted-foreground mr-1" />
                                <span>Presets</span>
                              </SelectTrigger>
                              <SelectContent align="end">
                                {MOCK_RESPONSE_TEMPLATES.map((t) => (
                                  <SelectItem key={t.name} value={t.name} className="text-xs">
                                    {t.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {manualReplyError && (
                          <div className="rounded bg-destructive/10 border border-destructive/20 p-2 text-xs text-destructive">
                            {manualReplyError}
                          </div>
                        )}

                        <PayloadEditor
                          value={manualReplyPayload}
                          onChange={setManualReplyPayload}
                          encoding={manualReplyEncoding}
                          onEncodingChange={setManualReplyEncoding}
                          rows={4}
                        />

                        <div className="flex justify-end gap-2 pt-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setActiveReplyQuery(null)}
                            className="h-7 text-xs"
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            variant="default"
                            size="sm"
                            disabled={isSendingManualReply}
                            onClick={handleSendManualReply}
                            className="h-7 text-xs font-medium gap-1.5"
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span>Dispatch Reply</span>
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default QueryablePanel;
