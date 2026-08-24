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
  Loader2,
  Code2,
  FileText,
  Play,
  MoreHorizontal,
  Pencil,
  Copy,
  CopyPlus,
  FileCode,
  Square,
  Check,
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
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuLabel,
} from '../ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '../ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog';
import { PayloadEditor } from '../viewer/PayloadEditor';
import { PayloadViewer } from '../viewer/PayloadViewer';
import { JavaScriptEditor } from '../viewer/JavaScriptEditor';
import { useQueryStore } from '../../stores/queryStore';
import { formatTimeWithMs, formatByteSize, encodePayload } from '../../lib/formatters';
import { SCRIPT_TEMPLATES } from '../../lib/scriptRunner';
import type {
  EncodingType,
  InboundQuery,
  ActiveQueryable,
  QueryableReplyMode,
} from '../../types/zenoh';



export interface QueryablePanelProps {
  sessionId?: string;
  profileId?: string;
  className?: string;
  compact?: boolean;
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
  compact = false,
}) => {
  const {
    activeQueryables,
    inboundQueries,
    declareQueryable,
    undeclareQueryable,
    editQueryable,
    replyInboundQuery,
    dismissInboundQuery,
    clearInboundQueries,
    updateQueryableConfig,
    error: storeError,
  } = useQueryStore();

  const [viewMode, setViewMode] = useState<'all' | 'form' | 'inbound'>(compact ? 'all' : 'all');

  // Form State: Declare Queryable
  const [keyExpr, setKeyExpr] = useState<string>('rpc/calculator/**');
  const [autoReply, setAutoReply] = useState<boolean>(true);
  const [replyMode, setReplyMode] = useState<QueryableReplyMode>('payload');
  const [replyEncoding, setReplyEncoding] = useState<EncodingType>('json');
  const [replyPayload, setReplyPayload] = useState<string>(
    MOCK_RESPONSE_TEMPLATES[0].content
  );
  const [scriptCode, setScriptCode] = useState<string>(SCRIPT_TEMPLATES[0].code);

  // Interactive Script Sandbox Test State
  const [testParams, setTestParams] = useState<string>(SCRIPT_TEMPLATES[0].sampleQuery);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Edit Queryable Dialog State
  const [editingQueryable, setEditingQueryable] = useState<ActiveQueryable | null>(null);
  const [editKeyExpr, setEditKeyExpr] = useState<string>('');
  const [editAutoReply, setEditAutoReply] = useState<boolean>(true);
  const [editReplyMode, setEditReplyMode] = useState<QueryableReplyMode>('payload');
  const [editReplyEncoding, setEditReplyEncoding] = useState<EncodingType>('json');
  const [editReplyPayload, setEditReplyPayload] = useState<string>('');
  const [editScriptCode, setEditScriptCode] = useState<string>('');
  const [editTestParams, setEditTestParams] = useState<string>('');
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Copied feedback state
  const [copiedId, setCopiedId] = useState<string | null>(null);

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
      if (profileId) return q.profileId === profileId;
      if (sessionId) return q.sessionId === sessionId;
      return true;
    });
  }, [activeQueryables, profileId, sessionId]);

  const sessionInboundQueries = useMemo(() => {
    const list = sessionId
      ? inboundQueries.filter((q) => !q.session_id || q.session_id === sessionId)
      : inboundQueries;
    // Strict deduplication by unique token to prevent duplicate React keys and reconciliation bugs
    const seen = new Set<string>();
    return list.filter((q) => {
      if (!q.token || seen.has(q.token)) return false;
      seen.add(q.token);
      return true;
    });
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
        replyMode === 'payload' ? replyPayload : undefined,
        replyEncoding,
        profileId,
        replyMode,
        replyMode === 'script' ? scriptCode : undefined
      );
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Start Editing Queryable Handler
  const handleStartEdit = (q: ActiveQueryable) => {
    const isScript = q.replyMode === 'script' || Boolean(q.scriptCode);
    setEditingQueryable(q);
    setEditKeyExpr(q.keyExpr);
    setEditAutoReply(q.autoReply);
    setEditReplyMode(isScript ? 'script' : 'payload');
    setEditReplyEncoding((q.replyEncoding as EncodingType) || 'json');
    setEditReplyPayload(q.replyPayload || MOCK_RESPONSE_TEMPLATES[0].content);
    setEditScriptCode(
      q.scriptCode || (isScript && q.replyPayload ? q.replyPayload : SCRIPT_TEMPLATES[0].code)
    );
    setEditTestParams(SCRIPT_TEMPLATES[0].sampleQuery);
    setEditError(null);
  };

  // Save Queryable Edit Changes
  const handleSaveEdit = async () => {
    if (!editingQueryable) return;
    const cleanKey = editKeyExpr.trim();
    if (!cleanKey) {
      setEditError('Key expression cannot be empty');
      return;
    }

    setIsSavingEdit(true);
    setEditError(null);
    try {
      await editQueryable(editingQueryable.id, {
        keyExpr: cleanKey,
        autoReply: editAutoReply,
        replyMode: editReplyMode,
        replyPayload: editReplyMode === 'payload' ? editReplyPayload : undefined,
        replyEncoding: editReplyEncoding,
        scriptCode: editReplyMode === 'script' ? editScriptCode : undefined,
      });
      setEditingQueryable(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Duplicate / Clone Queryable to Left Form
  const handleDuplicateToForm = (q: ActiveQueryable) => {
    setKeyExpr(q.keyExpr);
    setAutoReply(q.autoReply);
    const isScript = q.replyMode === 'script' || Boolean(q.scriptCode);
    setReplyMode(isScript ? 'script' : 'payload');
    if (q.replyEncoding) {
      setReplyEncoding(q.replyEncoding as EncodingType);
    }
    if (q.replyPayload) {
      setReplyPayload(q.replyPayload);
    }
    if (q.scriptCode || (isScript && q.replyPayload)) {
      setScriptCode(q.scriptCode || q.replyPayload || '');
    }
  };

  // Copy helper with feedback
  const handleCopyText = (text: string, id: string) => {
    try {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Ignore
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
    const targetQuery = activeReplyQuery;

    setManualReplyError(null);
    setIsSendingManualReply(true);

    try {
      const encoded = encodePayload(manualReplyPayload, manualReplyEncoding);
      if (!encoded.isValid) {
        throw new Error(encoded.error || 'Invalid payload encoding syntax');
      }

      await replyInboundQuery(
        targetQuery.token,
        targetQuery.key_expr,
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
      <div className="flex flex-wrap items-center justify-between border-b bg-card px-4 py-2 shrink-0 gap-2">
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

        {/* View Switcher & Actions */}
        <div className="flex items-center gap-2">
          {/* Sub-view switcher tabs for compact / split modes */}
          <div className="flex items-center rounded-md bg-muted p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('all')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                viewMode === 'all'
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setViewMode('form')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                viewMode === 'form'
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Declare ({sessionQueryables.length})
            </button>
            <button
              type="button"
              onClick={() => setViewMode('inbound')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors flex items-center gap-1 ${
                viewMode === 'inbound'
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span>Queue</span>
              {sessionInboundQueries.length > 0 && (
                <span className="font-mono text-[9px] bg-primary text-primary-foreground px-1 rounded-full">
                  {sessionInboundQueries.length}
                </span>
              )}
            </button>
          </div>

          {sessionInboundQueries.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => clearInboundQueries(sessionId)}
              className="h-6 text-[11px] px-2 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="w-3 h-3 mr-1" />
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Main Stage Grid: Responsive Column Layout */}
      <div
        className={`flex-1 min-h-0 overflow-hidden ${
          viewMode === 'all'
            ? 'grid grid-cols-1 xl:grid-cols-2 divide-y xl:divide-y-0 xl:divide-x divide-border'
            : 'flex flex-col'
        }`}
      >
        {/* Left Column: Register Queryable Form + Active Queryables List */}
        {(viewMode === 'all' || viewMode === 'form') && (
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

            {/* Auto-Reply Configuration Section */}
            {autoReply && (
              <div className="space-y-2 pt-1 border-t">
                {/* Mode Selector: Static Payload vs JavaScript Script */}
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-medium text-muted-foreground">
                    Response Mode
                  </label>
                  <div className="flex items-center rounded-md border bg-muted p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setReplyMode('payload')}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                        replyMode === 'payload'
                          ? 'bg-background text-foreground shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <FileText className="w-3 h-3" />
                      <span>Static Payload</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setReplyMode('script')}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                        replyMode === 'script'
                          ? 'bg-background text-foreground shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Code2 className="w-3 h-3 text-blue-500" />
                      <span>JavaScript Script</span>
                    </button>
                  </div>
                </div>

                {replyMode === 'payload' ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-muted-foreground">Mock Response Payload</span>
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
                ) : (
                  <JavaScriptEditor
                    value={scriptCode}
                    onChange={setScriptCode}
                    sampleQuery={testParams}
                    keyExpr={keyExpr}
                    sessionId={sessionId}
                    encoding={replyEncoding}
                    onTemplateSelect={(_, sample) => {
                      setTestParams(sample);
                    }}
                    rows={6}
                  />
                )}
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
              sessionQueryables.map((q: ActiveQueryable) => {
                const isScript = q.replyMode === 'script' || Boolean(q.scriptCode);
                return (
                  <ContextMenu key={q.id}>
                    <ContextMenuTrigger asChild>
                      <div
                        className="flex flex-col gap-1.5 rounded-md border bg-card p-2.5 hover:border-foreground/25 transition-all"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            <span className="font-mono text-xs font-medium text-foreground truncate">
                              {q.keyExpr}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {q.autoReply && (
                              <Badge
                                variant="outline"
                                className={`text-[9px] px-1.5 py-0.5 font-mono ${
                                  isScript
                                    ? 'text-blue-500 border-blue-500/30 bg-blue-500/10'
                                    : 'text-muted-foreground'
                                }`}
                              >
                                {isScript ? 'JS Script' : `Static [${q.replyEncoding || 'json'}]`}
                              </Badge>
                            )}

                            <button
                              type="button"
                              onClick={() =>
                                updateQueryableConfig(q.id, { autoReply: !q.autoReply })
                              }
                              className="text-xs flex items-center gap-1 focus:outline-none"
                              title={
                                q.autoReply
                                  ? 'Auto-reply is ON. Click to switch to Manual mode'
                                  : 'Manual mode. Click to enable Auto-reply'
                              }
                            >
                              {q.autoReply ? (
                                <Badge className="text-[9px] px-1.5 py-0.5 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25 transition-colors cursor-pointer">
                                  Auto Reply ON
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="text-[9px] px-1.5 py-0.5 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/10 transition-colors cursor-pointer"
                                >
                                  Manual (Queue)
                                </Badge>
                              )}
                            </button>

                            {/* Card More Actions Dropdown Menu */}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                                  title="More actions"
                                >
                                  <MoreHorizontal className="w-3.5 h-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48 text-xs">
                                <DropdownMenuLabel className="text-[10px] uppercase text-muted-foreground">
                                  Queryable Actions
                                </DropdownMenuLabel>
                                <DropdownMenuItem
                                  onClick={() => handleStartEdit(q)}
                                  className="cursor-pointer gap-2"
                                >
                                  <Pencil className="w-3.5 h-3.5 text-blue-500" />
                                  <span>Edit Configuration...</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() =>
                                    updateQueryableConfig(q.id, { autoReply: !q.autoReply })
                                  }
                                  className="cursor-pointer gap-2"
                                >
                                  {q.autoReply ? (
                                    <>
                                      <Square className="w-3.5 h-3.5 text-amber-500" />
                                      <span>Stop Auto-Reply (Queue)</span>
                                    </>
                                  ) : (
                                    <>
                                      <Play className="w-3.5 h-3.5 text-emerald-500" />
                                      <span>Start Auto-Reply</span>
                                    </>
                                  )}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleDuplicateToForm(q)}
                                  className="cursor-pointer gap-2"
                                >
                                  <CopyPlus className="w-3.5 h-3.5 text-muted-foreground" />
                                  <span>Duplicate to Form</span>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => handleCopyText(q.keyExpr, `key-${q.id}`)}
                                  className="cursor-pointer gap-2"
                                >
                                  {copiedId === `key-${q.id}` ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                                  )}
                                  <span>
                                    {copiedId === `key-${q.id}` ? 'Copied Key!' : 'Copy Key Expression'}
                                  </span>
                                </DropdownMenuItem>
                                {(q.replyPayload || q.scriptCode) && (
                                  <DropdownMenuItem
                                    onClick={() =>
                                      handleCopyText(
                                        q.scriptCode || q.replyPayload || '',
                                        `payload-${q.id}`
                                      )
                                    }
                                    className="cursor-pointer gap-2"
                                  >
                                    {copiedId === `payload-${q.id}` ? (
                                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                                    ) : (
                                      <FileCode className="w-3.5 h-3.5 text-muted-foreground" />
                                    )}
                                    <span>
                                      {copiedId === `payload-${q.id}`
                                        ? 'Copied Content!'
                                        : isScript
                                        ? 'Copy Script Code'
                                        : 'Copy Response Payload'}
                                    </span>
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => handleUndeclare(q.id)}
                                  className="cursor-pointer gap-2 text-destructive focus:text-destructive focus:bg-destructive/10"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>Undeclare Queryable</span>
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>

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

                        {/* Auto-reply payload or script preview */}
                        {q.autoReply && (
                          <div className="font-mono text-[10px] text-muted-foreground bg-muted/40 p-1.5 rounded border truncate flex items-center gap-1">
                            {isScript ? (
                              <>
                                <Code2 className="w-3 h-3 text-blue-500 shrink-0" />
                                <span className="truncate">
                                  {(q.scriptCode || q.replyPayload || '').replace(/[\r\n\t ]+/g, ' ')}
                                </span>
                              </>
                            ) : (
                              <>
                                <span className="font-medium uppercase text-foreground mr-1">
                                  [{q.replyEncoding || 'json'}]
                                </span>
                                <span className="truncate">
                                  {(q.replyPayload || '').replace(/[\r\n\t ]+/g, ' ')}
                                </span>
                              </>
                            )}
                          </div>
                        )}

                        <div className="text-[10px] text-muted-foreground font-mono">
                          Declared at {formatTimeWithMs(q.createdAt)}
                        </div>
                      </div>
                    </ContextMenuTrigger>

                    {/* Right-Click Context Menu */}
                    <ContextMenuContent className="w-48 text-xs">
                      <ContextMenuLabel className="text-[10px] uppercase text-muted-foreground">
                        Queryable Actions
                      </ContextMenuLabel>
                      <ContextMenuItem
                        onClick={() => handleStartEdit(q)}
                        className="cursor-pointer gap-2"
                      >
                        <Pencil className="w-3.5 h-3.5 text-blue-500" />
                        <span>Edit Configuration...</span>
                      </ContextMenuItem>
                      <ContextMenuItem
                        onClick={() =>
                          updateQueryableConfig(q.id, { autoReply: !q.autoReply })
                        }
                        className="cursor-pointer gap-2"
                      >
                        {q.autoReply ? (
                          <>
                            <Square className="w-3.5 h-3.5 text-amber-500" />
                            <span>Stop Auto-Reply (Queue)</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-3.5 h-3.5 text-emerald-500" />
                            <span>Start Auto-Reply</span>
                          </>
                        )}
                      </ContextMenuItem>
                      <ContextMenuItem
                        onClick={() => handleDuplicateToForm(q)}
                        className="cursor-pointer gap-2"
                      >
                        <CopyPlus className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>Duplicate to Form</span>
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuItem
                        onClick={() => handleCopyText(q.keyExpr, `key-${q.id}`)}
                        className="cursor-pointer gap-2"
                      >
                        {copiedId === `key-${q.id}` ? (
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                        )}
                        <span>
                          {copiedId === `key-${q.id}` ? 'Copied Key!' : 'Copy Key Expression'}
                        </span>
                      </ContextMenuItem>
                      {(q.replyPayload || q.scriptCode) && (
                        <ContextMenuItem
                          onClick={() =>
                            handleCopyText(
                              q.scriptCode || q.replyPayload || '',
                              `payload-${q.id}`
                            )
                          }
                          className="cursor-pointer gap-2"
                        >
                          {copiedId === `payload-${q.id}` ? (
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <FileCode className="w-3.5 h-3.5 text-muted-foreground" />
                          )}
                          <span>
                            {copiedId === `payload-${q.id}`
                              ? 'Copied Content!'
                              : isScript
                              ? 'Copy Script Code'
                              : 'Copy Response Payload'}
                          </span>
                        </ContextMenuItem>
                      )}
                      <ContextMenuSeparator />
                      <ContextMenuItem
                        onClick={() => handleUndeclare(q.id)}
                        className="cursor-pointer gap-2 text-destructive focus:text-destructive focus:bg-destructive/10"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Undeclare Queryable</span>
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                );
              })
            )}
          </div>
        </div>
        )}

        {/* Right Column: Inbound Queries Queue & Manual Responder */}
        {(viewMode === 'all' || viewMode === 'inbound') && (
        <div className="flex flex-col h-full overflow-y-auto p-3.5 space-y-3.5 bg-card/20">
          <div className="flex items-center justify-between">

            <div>
              <h4 className="text-xs font-semibold text-foreground">
                Inbound Queries (Manual Mode)
              </h4>
              <p className="text-[11px] text-muted-foreground">
                Live queue of queries arriving for queryables set to Manual mode
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">
                {sessionInboundQueries.length} pending
              </span>
              {sessionInboundQueries.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => clearInboundQueries(sessionId)}
                  className="h-6 text-[11px] px-2 text-muted-foreground hover:text-foreground"
                >
                  Clear Queue
                </Button>
              )}
            </div>
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
                const isStale = Date.now() - inbound.timestamp > 8000;

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
                        {isStale && (
                          <Badge variant="outline" className="text-[9px] font-mono text-amber-500 border-amber-500/30 px-1 py-0">
                            Stale
                          </Badge>
                        )}
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
                              setManualReplyError(null);
                            } else {
                              setActiveReplyQuery(inbound);
                              setManualReplyError(null);
                            }
                          }}
                          className="h-6 text-xs px-2 gap-1"
                        >
                          <Send className="w-3 h-3" />
                          <span>{isReplying ? 'Cancel' : 'Reply'}</span>
                        </Button>

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (isReplying) {
                              setActiveReplyQuery(null);
                              setManualReplyError(null);
                            }
                            dismissInboundQuery(inbound.token);
                          }}
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                          title="Dismiss query from queue"
                        >
                          <X className="w-3.5 h-3.5" />
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
                            onClick={() => {
                              setActiveReplyQuery(null);
                              setManualReplyError(null);
                            }}
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
                            {isSendingManualReply ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Send className="w-3.5 h-3.5" />
                            )}
                            <span>{isSendingManualReply ? 'Dispatching...' : 'Dispatch Reply'}</span>
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
        )}
      </div>

      {/* Edit Queryable Modal Dialog */}
      <Dialog
        open={Boolean(editingQueryable)}
        onOpenChange={(open) => {
          if (!open) {
            setEditingQueryable(null);
            setEditError(null);
          }
        }}
      >
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <Pencil className="w-4 h-4 text-primary" />
              <span>Edit Queryable Configuration</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Modify the key expression, auto-response mode, or reply payload/script.
            </DialogDescription>
          </DialogHeader>

          {editError && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 p-2 text-xs text-destructive">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{editError}</span>
            </div>
          )}

          <div className="space-y-3 py-1">
            {/* Key Expression */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">
                Key Expression
              </label>
              <Input
                type="text"
                value={editKeyExpr}
                onChange={(e) => setEditKeyExpr(e.target.value)}
                placeholder="e.g. rpc/calculator/**"
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
                  Automatically respond when query arrives
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditAutoReply(!editAutoReply)}
                className="text-foreground transition-opacity"
              >
                {editAutoReply ? (
                  <ToggleRight className="w-6 h-6 text-foreground" />
                ) : (
                  <ToggleLeft className="w-6 h-6 text-muted-foreground" />
                )}
              </button>
            </div>

            {/* Mode & Body Editor */}
            {editAutoReply && (
              <div className="space-y-2 pt-1 border-t">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-medium text-muted-foreground">
                    Response Mode
                  </label>
                  <div className="flex items-center rounded-md border bg-muted p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setEditReplyMode('payload')}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                        editReplyMode === 'payload'
                          ? 'bg-background text-foreground shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <FileText className="w-3 h-3" />
                      <span>Static Payload</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditReplyMode('script')}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                        editReplyMode === 'script'
                          ? 'bg-background text-foreground shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Code2 className="w-3 h-3 text-blue-500" />
                      <span>JavaScript Script</span>
                    </button>
                  </div>
                </div>

                {editReplyMode === 'payload' ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-muted-foreground">Response Payload</span>
                      <Select
                        onValueChange={(val) => {
                          const tmpl = MOCK_RESPONSE_TEMPLATES.find((t) => t.name === val);
                          if (tmpl) {
                            setEditReplyPayload(tmpl.content);
                            setEditReplyEncoding(tmpl.encoding);
                          }
                        }}
                      >
                        <SelectTrigger className="h-6 text-[10px] px-2 gap-1 bg-background border-muted w-32">
                          <Sparkles className="w-3 h-3 mr-1 text-muted-foreground" />
                          <span>Presets</span>
                        </SelectTrigger>
                        <SelectContent align="end">
                          {MOCK_RESPONSE_TEMPLATES.map((tmpl) => (
                            <SelectItem key={tmpl.name} value={tmpl.name} className="text-xs">
                              {tmpl.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <PayloadEditor
                      value={editReplyPayload}
                      onChange={setEditReplyPayload}
                      encoding={editReplyEncoding}
                      onEncodingChange={setEditReplyEncoding}
                      rows={4}
                    />
                  </div>
                ) : (
                  <JavaScriptEditor
                    value={editScriptCode}
                    onChange={setEditScriptCode}
                    sampleQuery={editTestParams}
                    keyExpr={editKeyExpr}
                    sessionId={sessionId}
                    encoding={editReplyEncoding}
                    onTemplateSelect={(_, sample) => {
                      setEditTestParams(sample);
                    }}
                    rows={6}
                  />
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditingQueryable(null)}
              className="h-8 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSaveEdit}
              disabled={isSavingEdit || !editKeyExpr.trim()}
              className="h-8 text-xs font-medium gap-1.5"
            >
              {isSavingEdit && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Save Changes</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};



export default QueryablePanel;
