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
    description: 'Remote procedure call with arithmetic parameters',
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
      const base = baseKeyExpr || 'demo/**';
      if (updated.length === 0) {
        setSelector(base);
      } else {
        const queryStr = updated
          .map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
          .join('&');
        setSelector(`${base}?${queryStr}`);
      }
    },
    [baseKeyExpr, parsedParams]
  );

  // Execute Query
  const handleRunQuery = async () => {
    if (!sessionId) {
      setErrorMessage('No active Zenoh session connected.');
      return;
    }
    const cleanSelector = selector.trim();
    if (!cleanSelector) {
      setErrorMessage('Please enter a valid key expression or selector.');
      return;
    }

    setErrorMessage(null);
    setIsRunning(true);

    try {
      await runQuery(sessionId, cleanSelector, target, timeoutMs, profileId);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRunning(false);
    }
  };

  // Apply Preset
  const handleApplyPreset = (preset: SelectorPreset) => {
    setSelector(preset.selector);
    if (preset.target) {
      setTarget(preset.target);
    }
  };

  return (
    <div className={`flex flex-col h-full bg-card text-card-foreground border-r border-border ${className}`}>
      {/* Header Bar */}
      <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-primary/10 text-primary">
            <Target className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold tracking-tight text-foreground">
              Querier (RPC Client)
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Issue distributed <code className="font-mono text-primary font-semibold">get</code> requests with selectors
            </p>
          </div>
        </div>

        {/* Quick Presets Dropdown */}
        <div className="relative group">
          <Select
            onValueChange={(val) => {
              const preset = SELECTOR_PRESETS.find((p) => p.selector === val);
              if (preset) handleApplyPreset(preset);
            }}
          >
            <SelectTrigger className="h-7 text-xs px-2.5 gap-1.5 bg-background border-muted font-medium">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Presets</span>
            </SelectTrigger>
            <SelectContent align="end" className="w-64">
              {SELECTOR_PRESETS.map((preset) => (
                <SelectItem key={preset.selector} value={preset.selector} className="text-xs">
                  <div className="flex flex-col">
                    <span className="font-medium text-foreground">{preset.label}</span>
                    <span className="font-mono text-[10px] text-primary">{preset.selector}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Main Form Scrollable Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Error Alert */}
        {errorMessage && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-semibold">Query Execution Error:</span>
              <p className="mt-0.5 break-all">{errorMessage}</p>
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
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Key Expression / Selector
            </label>
            <button
              type="button"
              onClick={() => setShowParamsBuilder(!showParamsBuilder)}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
            >
              <Sliders className="w-3 h-3" />
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
              className="font-mono text-xs pr-8 h-9 shadow-xs focus-visible:ring-primary"
            />
            {selector && (
              <button
                type="button"
                onClick={() => setSelector('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Supports wildcards (<code className="font-mono text-primary">*</code>,{' '}
            <code className="font-mono text-primary">**</code>) and query parameters (
            <code className="font-mono text-primary">?key=value</code>).
          </p>
        </div>

        {/* 2. Interactive Query Parameters Builder (Collapsible) */}
        {showParamsBuilder && (
          <div className="rounded-lg border bg-muted/20 p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">
                Query Predicates / Parameters
              </span>
              <span className="text-[10px] text-muted-foreground font-mono">
                {parsedParams.length} param{parsedParams.length === 1 ? '' : 's'}
              </span>
            </div>

            {/* List of current params */}
            {parsedParams.length > 0 ? (
              <div className="space-y-1.5">
                {parsedParams.map((p, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-2 rounded bg-background px-2.5 py-1 text-xs border font-mono"
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="text-primary font-bold">{p.key}</span>
                      <span className="text-muted-foreground">=</span>
                      <span className="text-foreground truncate">{p.value}</span>
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
                No parameters currently added to selector.
              </p>
            )}

            {/* Add new param form */}
            <div className="flex items-center gap-1.5 pt-1">
              <Input
                type="text"
                placeholder="param_name"
                value={paramKey}
                onChange={(e) => setParamKey(e.target.value)}
                className="h-7 text-xs font-mono flex-1"
                onKeyDown={(e) => e.key === 'Enter' && handleAddParam()}
              />
              <span className="text-xs text-muted-foreground font-mono">=</span>
              <Input
                type="text"
                placeholder="value"
                value={paramValue}
                onChange={(e) => setParamValue(e.target.value)}
                className="h-7 text-xs font-mono flex-1"
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          {/* Target Dropdown */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Target className="w-3.5 h-3.5" />
              <span>Target</span>
            </label>
            <Select
              value={target}
              onValueChange={(val) => setTarget(val as QueryTarget)}
              disabled={isRunning}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Select target" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">
                  <div className="font-medium">All (all queryables)</div>
                </SelectItem>
                <SelectItem value="complete" className="text-xs">
                  <div className="font-medium">Complete (complete set)</div>
                </SelectItem>
                <SelectItem value="best_matching" className="text-xs">
                  <div className="font-medium">Best Matching (single best)</div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Timeout Control */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                <span>Timeout</span>
              </label>
              <span className="font-mono text-xs font-bold text-foreground">
                {timeoutMs} ms ({(timeoutMs / 1000).toFixed(1)}s)
              </span>
            </div>
            <div className="flex items-center gap-2 h-9">
              <input
                type="range"
                min={100}
                max={10000}
                step={100}
                value={timeoutMs}
                onChange={(e) => setTimeoutMs(Number(e.target.value))}
                disabled={isRunning}
                className="w-full accent-primary h-1.5 bg-muted rounded-lg cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* 4. Action Button: Run Query */}
        <div className="pt-2">
          <Button
            type="button"
            onClick={handleRunQuery}
            disabled={isRunning || !sessionId || !selector.trim()}
            className="w-full h-10 gap-2 font-semibold shadow-md transition-all active:scale-[0.99]"
            variant="default"
          >
            {isRunning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-primary-foreground" />
                <span>Querying Zenoh Network…</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>Run Query</span>
              </>
            )}
          </Button>
        </div>

        {/* 5. Past Query Executions History */}
        <div className="pt-4 border-t space-y-2">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground uppercase tracking-wider"
            >
              <History className="w-3.5 h-3.5" />
              <span>Query History ({sessionExecutions.length})</span>
              {showHistory ? (
                <ChevronUp className="w-3 h-3 ml-0.5" />
              ) : (
                <ChevronDown className="w-3 h-3 ml-0.5" />
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
            <div className="space-y-1.5">
              {sessionExecutions.length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                  No query executions recorded yet.
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
                      className={`flex flex-col gap-1 rounded-lg border p-2.5 text-xs cursor-pointer transition-colors ${
                        isSelected
                          ? 'border-primary bg-primary/5 shadow-xs'
                          : 'border-border hover:bg-muted/40'
                      }`}
                    >
                      {/* Top row: Status, selector, time */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 truncate">
                          {isRunningExec ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary shrink-0" />
                          ) : hasError ? (
                            <XCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          )}
                          <span className="font-mono font-bold text-foreground truncate">
                            {exec.selector}
                          </span>
                        </div>
                        <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                          {formatTimeWithMs(exec.startedAt)}
                        </span>
                      </div>

                      {/* Bottom row: target pill, reply count, latency */}
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="rounded bg-muted px-1.5 py-0.2 font-mono text-[10px] uppercase">
                            {exec.target}
                          </span>
                          <span
                            className={`font-semibold ${
                              replyCount > 0
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-muted-foreground'
                            }`}
                          >
                            {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
                          </span>
                        </div>

                        {exec.durationMs !== undefined && (
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {exec.durationMs} ms
                          </span>
                        )}
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
