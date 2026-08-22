import React, { useState, useMemo, useCallback } from 'react';
import {
  Play,
  Loader2,
  Clock,
  Target,
  Sliders,
  Sparkles,
  History,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Plus,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { useQueryStore } from '../../stores/queryStore';
import { formatTimeWithMs } from '../../lib/formatters';
import type { QueryTarget, QueryExecution } from '../../types/zenoh';

export interface QuerierPanelProps {
  sessionId?: string;
  profileId?: string;
  className?: string;
}

export interface SelectorPreset {
  label: string;
  selector: string;
  description: string;
  target?: QueryTarget;
}

export const SELECTOR_PRESETS: SelectorPreset[] = [
  {
    label: 'Wildcard All Topics',
    selector: 'demo/**',
    description: 'Query all storage and queryables under demo/',
    target: 'all',
  },
  {
    label: 'Sensor with Limit',
    selector: 'demo/sensor?limit=10',
    description: 'Query sensor topic with predicate limit=10',
    target: 'all',
  },
  {
    label: 'RPC Calculator',
    selector: 'rpc/calculator?op=add&a=15&b=27',
    description: 'Remote procedure call with parameters',
    target: 'best_matching',
  },
  {
    label: 'Device Status Filter',
    selector: 'telemetry/devices/*?status=active&health=ok',
    description: 'Query active devices with health status ok',
    target: 'complete',
  },
  {
    label: 'Zenoh Admin & Stats',
    selector: '@/**',
    description: 'Query internal Zenoh router daemon status',
    target: 'all',
  },
];

export const QuerierPanel: React.FC<QuerierPanelProps> = ({
  sessionId,
  profileId,
  className = '',
}) => {
  const {
    executions,
    activeExecutionId,
    runQuery,
    selectExecution,
    clearExecutions,
  } = useQueryStore();

  const [selector, setSelector] = useState<string>('demo/**');
  const [target, setTarget] = useState<QueryTarget>('all');
  const [timeoutMs, setTimeoutMs] = useState<number>(2000);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Parameter Builder state
  const [showParamsBuilder, setShowParamsBuilder] = useState<boolean>(false);
  const [paramKey, setParamKey] = useState<string>('');
  const [paramValue, setParamValue] = useState<string>('');

  // History list expansion
  const [showHistory, setShowHistory] = useState<boolean>(true);

  // Filter executions for current session
  const sessionExecutions = useMemo(() => {
    if (!sessionId) return executions;
    return executions.filter((e) => !e.sessionId || e.sessionId === sessionId);
  }, [executions, sessionId]);

  // Parse parameters from current selector
  const parsedParams = useMemo(() => {
    const qIndex = selector.indexOf('?');
    if (qIndex === -1) return [];
    const queryString = selector.slice(qIndex + 1);
    return queryString
      .split('&')
      .filter(Boolean)
      .map((pair) => {
        const [k, v = ''] = pair.split('=');
        return {
          key: decodeURIComponent(k || ''),
          value: decodeURIComponent(v || ''),
        };
      });
  }, [selector]);

  // Base key expression without parameters
  const baseKeyExpr = useMemo(() => {
    const qIndex = selector.indexOf('?');
    return qIndex === -1 ? selector : selector.slice(0, qIndex);
  }, [selector]);

  // Add parameter to selector
  const handleAddParam = useCallback(() => {
    if (!paramKey.trim()) return;
    const base = baseKeyExpr || 'demo/**';
    const newParams = [...parsedParams, { key: paramKey.trim(), value: paramValue.trim() }];
    const queryStr = newParams
      .map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
      .join('&');
    setSelector(`${base}?${queryStr}`);
    setParamKey('');
    setParamValue('');
  }, [paramKey, paramValue, baseKeyExpr, parsedParams]);

  // Remove parameter from selector
  const handleRemoveParam = useCallback(
    (index: number) => {
      const updated = parsedParams.filter((_, i) => i !== index);
      if (updated.length === 0) {
        setSelector(baseKeyExpr);
      } else {
        const queryStr = updated
          .map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
          .join('&');
        setSelector(`${baseKeyExpr}?${queryStr}`);
      }
    },
    [parsedParams, baseKeyExpr]
  );

  // Execute Query
  const handleRunQuery = useCallback(async () => {
    if (!selector.trim()) {
      setErrorMessage('Selector expression cannot be empty.');
      return;
    }

    if (!sessionId) {
      setErrorMessage('No active Zenoh session connected.');
      return;
    }

    setIsRunning(true);
    setErrorMessage(null);

    try {
      await runQuery(sessionId, selector.trim(), target, timeoutMs, profileId);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRunning(false);
    }
  }, [selector, sessionId, profileId, target, timeoutMs, runQuery]);

  return (
    <div
      className={`flex flex-col h-full bg-card text-card-foreground p-3.5 space-y-4 overflow-y-auto ${className}`}
    >
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b pb-2.5">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-xs text-foreground">
            Query Client
          </span>
          <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            session.get()
          </span>
        </div>

        {/* Preset Selector Dropdown */}
        <Select
          onValueChange={(val) => {
            const found = SELECTOR_PRESETS.find((p) => p.selector === val);
            if (found) {
              setSelector(found.selector);
              if (found.target) setTarget(found.target);
            }
          }}
        >
          <SelectTrigger className="h-7 text-xs w-[160px] bg-muted/40">
            <Sparkles className="w-3 h-3 mr-1 text-muted-foreground" />
            <SelectValue placeholder="Presets..." />
          </SelectTrigger>
          <SelectContent>
            {SELECTOR_PRESETS.map((preset) => (
              <SelectItem key={preset.selector} value={preset.selector} className="text-xs">
                <div>
                  <span className="font-medium block">{preset.label}</span>
                  <span className="text-[10px] text-muted-foreground font-mono">{preset.selector}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Query Form Section */}
      <div className="space-y-3.5">
        {/* Error Alert if any */}
        {errorMessage && (
          <div className="rounded-md border border-destructive/20 bg-destructive/10 p-2.5 text-xs text-destructive flex items-start justify-between gap-2">
            <div className="flex items-start gap-1.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-destructive hover:opacity-70"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* 1. Selector / Key Expression Input */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-medium text-muted-foreground">
              Key Expression / Selector
            </label>
            <button
              type="button"
              onClick={() => setShowParamsBuilder(!showParamsBuilder)}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground hover:underline"
            >
              <Sliders className="w-3 h-3 text-muted-foreground" />
              <span>{showParamsBuilder ? 'Hide Params' : 'Query Params'}</span>
            </button>
          </div>

          <div className="relative">
            <Input
              type="text"
              value={selector}
              onChange={(e) => setSelector(e.target.value)}
              placeholder="e.g. demo/sensor?limit=10"
              disabled={isRunning}
              className="font-mono text-xs pr-8 h-8 bg-background"
            />
            {selector && (
              <button
                type="button"
                onClick={() => setSelector('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* 2. Interactive Query Parameters Builder (Collapsible) */}
        {showParamsBuilder && (
          <div className="rounded-md border bg-muted/20 p-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">
                Query Parameters
              </span>
              <span className="text-[10px] text-muted-foreground font-mono">
                {parsedParams.length} param{parsedParams.length === 1 ? '' : 's'}
              </span>
            </div>

            {/* List of current params */}
            {parsedParams.length > 0 ? (
              <div className="space-y-1">
                {parsedParams.map((p, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-2 rounded bg-background px-2 py-1 text-xs border font-mono"
                  >
                    <div className="flex items-center gap-1 truncate">
                      <span className="font-semibold text-foreground">{p.key}</span>
                      <span className="text-muted-foreground">=</span>
                      <span className="text-muted-foreground truncate">{p.value}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveParam(idx)}
                      className="text-muted-foreground hover:text-destructive shrink-0"
                      title="Remove parameter"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground italic">
                No parameters added.
              </p>
            )}

            {/* Add new param form */}
            <div className="flex items-center gap-1.5 pt-1">
              <Input
                type="text"
                placeholder="param_name"
                value={paramKey}
                onChange={(e) => setParamKey(e.target.value)}
                className="h-7 text-xs font-mono flex-1 bg-background"
                onKeyDown={(e) => e.key === 'Enter' && handleAddParam()}
              />
              <span className="text-xs text-muted-foreground font-mono">=</span>
              <Input
                type="text"
                placeholder="value"
                value={paramValue}
                onChange={(e) => setParamValue(e.target.value)}
                className="h-7 text-xs font-mono flex-1 bg-background"
                onKeyDown={(e) => e.key === 'Enter' && handleAddParam()}
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={handleAddParam}
                disabled={!paramKey.trim()}
                className="h-7 px-2 text-xs"
              >
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}

        {/* 3. Query Target & Timeout Settings */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Target Dropdown */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
              <Target className="w-3.5 h-3.5" />
              <span>Target</span>
            </label>
            <Select
              value={target}
              onValueChange={(val) => setTarget(val as QueryTarget)}
              disabled={isRunning}
            >
              <SelectTrigger className="h-8 text-xs bg-background">
                <SelectValue placeholder="Select target" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">
                  All Queryables
                </SelectItem>
                <SelectItem value="complete" className="text-xs">
                  Complete Set
                </SelectItem>
                <SelectItem value="best_matching" className="text-xs">
                  Best Matching
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Timeout Control */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                <span>Timeout</span>
              </label>
              <span className="font-mono text-xs font-medium text-foreground">
                {timeoutMs} ms
              </span>
            </div>
            <div className="flex items-center gap-2 h-8">
              <input
                type="range"
                min={100}
                max={10000}
                step={100}
                value={timeoutMs}
                onChange={(e) => setTimeoutMs(Number(e.target.value))}
                disabled={isRunning}
                className="w-full h-1.5 bg-muted rounded-md cursor-pointer accent-primary"
              />
            </div>
          </div>
        </div>

        {/* 4. Action Button: Run Query */}
        <div className="pt-1">
          <Button
            type="button"
            onClick={handleRunQuery}
            disabled={isRunning || !sessionId || !selector.trim()}
            className="w-full h-9 gap-2 font-medium"
            variant="default"
          >
            {isRunning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Querying Zenoh Network…</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Run Query</span>
              </>
            )}
          </Button>
        </div>

        {/* 5. Past Query Executions History */}
        <div className="pt-3 border-t space-y-2">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-1.5 text-xs font-semibold text-foreground"
            >
              <History className="w-3.5 h-3.5 text-muted-foreground" />
              <span>Query History ({sessionExecutions.length})</span>
              {showHistory ? (
                <ChevronUp className="w-3 h-3 text-muted-foreground ml-0.5" />
              ) : (
                <ChevronDown className="w-3 h-3 text-muted-foreground ml-0.5" />
              )}
            </button>

            {sessionExecutions.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => clearExecutions(sessionId)}
                className="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-destructive"
                title="Clear query history"
              >
                <Trash2 className="w-3 h-3 mr-1" />
                Clear
              </Button>
            )}
          </div>

          {showHistory && (
            <div className="space-y-1">
              {sessionExecutions.length === 0 ? (
                <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
                  No query history yet.
                </div>
              ) : (
                sessionExecutions.map((exec: QueryExecution) => {
                  const isSelected = exec.id === activeExecutionId;
                  const replyCount = exec.replies?.length || 0;
                  const hasError = exec.status === 'error';
                  const isRunningExec = exec.status === 'running';

                  return (
                    <div
                      key={exec.id}
                      onClick={() => selectExecution(exec.id)}
                      className={`rounded-md border p-2 text-xs transition-colors cursor-pointer select-none ${
                        isSelected
                          ? 'border-foreground/30 bg-muted/60'
                          : 'border-transparent hover:bg-muted/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 truncate">
                          {isRunningExec ? (
                            <Loader2 className="w-3 h-3 animate-spin text-amber-500 shrink-0" />
                          ) : hasError ? (
                            <XCircle className="w-3 h-3 text-destructive shrink-0" />
                          ) : (
                            <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                          )}
                          <span className="font-mono truncate font-medium text-foreground">
                            {exec.selector}
                          </span>
                        </div>

                        <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                          {exec.durationMs !== undefined ? `${exec.durationMs}ms` : '...'}
                        </span>
                      </div>

                      <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>{formatTimeWithMs(exec.startedAt)}</span>
                        <span className="font-mono">
                          {replyCount} repl{replyCount === 1 ? 'y' : 'ies'}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default QuerierPanel;
