import React, { useState, useMemo } from 'react';
import {
  Server,
  Plus,
  Trash2,
  Send,
  Sparkles,
  Inbox,
  AlertCircle,
  Clock,
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
import { encodePayload, formatByteSize, formatTimeWithMs } from '../../lib/formatters';
import type { EncodingType, ActiveQueryable, InboundQuery } from '../../types/zenoh';

export interface QueryablePanelProps {
  sessionId?: string;
  profileId?: string;
  className?: string;
}

export interface MockResponseTemplate {
  name: string;
  description: string;
  encoding: EncodingType;
  content: string;
}

export const MOCK_RESPONSE_TEMPLATES: MockResponseTemplate[] = [
  {
    name: 'RPC Success Result',
    description: 'Standard RPC response with computed result and status ok',
    encoding: 'json',
    content: JSON.stringify(
      {
        status: 'ok',
        result: 42,
        server_node: 'zenoh-mock-worker-1',
        timestamp: Date.now(),
      },
      null,
      2
    ),
  },
  {
    name: 'Sensor Data Response',
    description: 'Simulated sensor reading reply',
    encoding: 'json',
    content: JSON.stringify(
      {
        sensor_id: 'temp-sensor-101',
        temperature: 24.8,
        humidity: 58.0,
        pressure_hpa: 1013.25,
        unit: 'celsius',
        uptime_s: 3600,
      },
      null,
      2
    ),
  },
  {
    name: 'Plain Text Ack / Pong',
    description: 'Simple text string reply',
    encoding: 'text',
    content: 'PONG: zenoh service ready',
  },
  {
    name: 'Raw Binary Ack',
    description: 'Hex byte representation for binary protocols',
    encoding: 'raw',
    content: '0x00 0x01 0x7f 0xff',
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
    updateQueryableConfig,
    replyInboundQuery,
    clearInboundQueries,
    error: storeError,
  } = useQueryStore();

  // Declare form state
  const [keyExpr, setKeyExpr] = useState<string>('rpc/calculator/**');
  const [autoReply, setAutoReply] = useState<boolean>(true);
  const [replyEncoding, setReplyEncoding] = useState<EncodingType>('json');
  const [replyPayload, setReplyPayload] = useState<string>(
    JSON.stringify({ status: 'ok', result: 42, timestamp: Date.now() }, null, 2)
  );
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Manual reply composer state for inbound queries
  const [activeReplyQuery, setActiveReplyQuery] = useState<InboundQuery | null>(null);
  const [manualReplyEncoding, setManualReplyEncoding] = useState<EncodingType>('json');
  const [manualReplyPayload, setManualReplyPayload] = useState<string>(
    JSON.stringify({ status: 'success', message: 'Manual reply from operator' }, null, 2)
  );
  const [isSendingManualReply, setIsSendingManualReply] = useState<boolean>(false);
  const [manualReplyError, setManualReplyError] = useState<string | null>(null);

  // Filtered lists for session
  const sessionQueryables = useMemo(() => {
    if (!sessionId) return activeQueryables;
    return activeQueryables.filter((q) => !q.sessionId || q.sessionId === sessionId);
  }, [activeQueryables, sessionId]);

  const sessionInboundQueries = useMemo(() => {
    if (!sessionId) return inboundQueries;
    return inboundQueries.filter((q) => !q.session_id || q.session_id === sessionId);
  }, [inboundQueries, sessionId]);

  // Declare Queryable Handler
  const handleDeclare = async () => {
    if (!sessionId) {
      setFormError('No active Zenoh session connected.');
      return;
    }
    const cleanKey = keyExpr.trim();
    if (!cleanKey) {
      setFormError('Key expression cannot be empty.');
      return;
    }

    setFormError(null);
    setIsSubmitting(true);

    try {
      await declareQueryable(
        sessionId,
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
    if (!sessionId) return;
    try {
      await undeclareQueryable(sessionId, queryableId);
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
      <div className="flex flex-wrap items-center justify-between border-b bg-card px-4 py-3 shrink-0 shadow-xs gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400">
            <Server className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold tracking-tight text-foreground">
              Queryable Simulator & Server
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Register distributed RPC endpoints and automate mock query responses
            </p>
          </div>
        </div>

        {/* Inbound Queries Counter Badge */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-muted/60 px-2.5 py-1 rounded-md text-xs">
            <Inbox className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="font-semibold text-foreground">Inbound Queue:</span>
            <span
              className={`font-mono font-bold px-1.5 rounded text-[11px] ${
                sessionInboundQueries.length > 0
                  ? 'bg-purple-500 text-white animate-pulse'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
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

      {/* Main Stage Grid: 2 Column Layout (Left: Register Form & Active Queryables | Right: Inbound Queries Queue & Responder) */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 min-h-0 divide-y lg:divide-y-0 lg:divide-x divide-border overflow-hidden">
        {/* Left Column: Register Queryable Form + Active Queryables List */}
        <div className="flex flex-col h-full overflow-y-auto p-4 space-y-4 bg-card/40">
          {/* Error notification */}
          {(formError || storeError) && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
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
          <div className="rounded-xl border bg-card p-4 space-y-3.5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                Declare New Queryable
              </span>
              <Badge variant="purple" className="text-[10px] font-mono uppercase">
                RPC Provider
              </Badge>
            </div>

            {/* Key Expression */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">
                Key Expression
              </label>
              <Input
                type="text"
                value={keyExpr}
                onChange={(e) => setKeyExpr(e.target.value)}
                placeholder="e.g. rpc/calculator/** or demo/sensor/*"
                disabled={isSubmitting}
                className="font-mono text-xs h-9"
              />
              <p className="text-[11px] text-muted-foreground">
                Zenoh will route matching <code className="font-mono text-primary">get</code> requests to this queryable.
              </p>
            </div>

            {/* Auto-Reply Switch */}
            <div className="flex items-center justify-between rounded-lg border bg-muted/20 p-2.5">
              <div>
                <div className="text-xs font-semibold text-foreground">
                  Automated Mock Reply
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Automatically send mock response when a query is received
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAutoReply(!autoReply)}
                className="text-primary hover:opacity-80 transition-opacity"
              >
                {autoReply ? (
                  <ToggleRight className="w-6 h-6 text-primary fill-primary/20" />
                ) : (
                  <ToggleLeft className="w-6 h-6 text-muted-foreground" />
                )}
              </button>
            </div>

            {/* Mock Response Payload Editor (shown if auto-reply is on) */}
            {autoReply && (
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-muted-foreground">
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
                    <SelectTrigger className="h-6 text-[11px] px-2 gap-1 bg-background border-muted w-36">
                      <Sparkles className="w-3 h-3 text-amber-500" />
                      <span>Mock Presets</span>
                    </SelectTrigger>
                    <SelectContent align="end">
                      {MOCK_RESPONSE_TEMPLATES.map((tmpl) => (
                        <SelectItem key={tmpl.name} value={tmpl.name} className="text-xs">
                          <div className="flex flex-col">
                            <span className="font-medium text-foreground">{tmpl.name}</span>
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
                  rows={5}
                />
              </div>
            )}

            {/* Submit Button */}
            <Button
              type="button"
              onClick={handleDeclare}
              disabled={isSubmitting || !sessionId || !keyExpr.trim()}
              className="w-full h-9 font-semibold gap-1.5 shadow-sm"
              variant="purple"
            >
              <Plus className="w-4 h-4" />
              <span>Declare Queryable</span>
            </Button>
          </div>

          {/* Active Queryables List */}
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Active Declared Queryables ({sessionQueryables.length})
              </span>
            </div>

            {sessionQueryables.length === 0 ? (
              <div className="rounded-xl border border-dashed p-6 text-center text-xs text-muted-foreground bg-card/30">
                <Server className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
                <p className="font-semibold text-foreground">No Queryables Declared</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Declare a key expression above to start listening and responding to RPC queries.
                </p>
              </div>
            ) : (
              sessionQueryables.map((q: ActiveQueryable) => (
                <div
                  key={q.id}
                  className="flex flex-col gap-2 rounded-xl border bg-card p-3 shadow-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
                      </span>
                      <span className="font-mono text-xs font-bold text-foreground truncate">
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
                          <Badge variant="purple" className="text-[10px] px-1.5 py-0 uppercase">
                            Auto-Reply ON
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 uppercase">
                            Manual
                          </Badge>
                        )}
                      </button>

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleUndeclare(q.id)}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        title="Undeclare queryable"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Auto-reply payload preview */}
                  {q.autoReply && q.replyPayload && (
                    <div className="font-mono text-[11px] text-muted-foreground bg-muted/40 p-2 rounded border border-border/40 truncate">
                      <span className="font-semibold uppercase text-primary mr-1">
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
        <div className="flex flex-col h-full overflow-y-auto p-4 space-y-4 bg-card/20">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
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
            <div className="flex flex-col items-center justify-center h-64 text-center p-6 border border-dashed rounded-xl bg-card/30">
              <Inbox className="w-10 h-10 text-muted-foreground/40 mb-3" />
              <h5 className="text-sm font-semibold text-foreground">
                No Pending Inbound Queries
              </h5>
              <p className="text-xs text-muted-foreground max-w-sm mt-1">
                When remote nodes send queries to your declared key expressions (with Auto-Reply disabled or awaiting manual dispatch), they will appear here in real-time.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {sessionInboundQueries.map((inbound: InboundQuery) => {
                const isReplying = activeReplyQuery?.token === inbound.token;

                return (
                  <div
                    key={inbound.token}
                    className={`rounded-xl border p-3.5 space-y-2.5 transition-all shadow-xs ${
                      isReplying
                        ? 'border-purple-500 bg-purple-500/5 ring-1 ring-purple-500/30'
                        : 'border-border bg-card hover:bg-muted/30'
                    }`}
                  >
                    {/* Header: Key Expression, Parameters, Time */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 truncate">
                        <Badge variant="purple" className="text-[10px] uppercase font-mono px-1.5 py-0">
                          Query
                        </Badge>
                        <span className="font-mono text-xs font-bold text-foreground truncate">
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
                          variant={isReplying ? 'default' : 'purple'}
                          onClick={() => {
                            if (isReplying) {
                              setActiveReplyQuery(null);
                            } else {
                              setActiveReplyQuery(inbound);
                            }
                          }}
                          className="h-7 text-xs px-2.5 gap-1 shadow-xs"
                        >
                          <Send className="w-3 h-3" />
                          <span>{isReplying ? 'Cancel' : 'Reply'}</span>
                        </Button>
                      </div>
                    </div>

                    {/* Parameters if any */}
                    {inbound.parameters && (
                      <div className="font-mono text-xs bg-muted/40 p-1.5 rounded border text-muted-foreground">
                        <span className="font-semibold text-foreground mr-1">Query Params:</span>
                        <span className="text-primary font-bold">{inbound.parameters}</span>
                      </div>
                    )}

                    {/* Query Payload if incoming query has body */}
                    {inbound.payload && inbound.payload.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-[10px] uppercase font-semibold text-muted-foreground">
                          Incoming Query Payload ({formatByteSize(inbound.payload.length)})
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
                      <div className="pt-2 border-t space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-foreground flex items-center gap-1">
                            <Send className="w-3.5 h-3.5 text-primary" />
                            <span>Craft Manual Response</span>
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
                                <Sparkles className="w-3 h-3 text-amber-500 mr-1" />
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
                            className="h-8 text-xs"
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            variant="default"
                            size="sm"
                            disabled={isSendingManualReply}
                            onClick={handleSendManualReply}
                            className="h-8 text-xs font-semibold gap-1.5 shadow-sm"
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
