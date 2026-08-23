import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  Sparkles,
  Maximize2,
  Copy,
  Check,
  Trash2,
  Code2,
  Play,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '../ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog';
import { formatJsCode } from '../../lib/codeFormatter';
import {
  SCRIPT_TEMPLATES,
  executeInboundScript,
  type ScriptExecutionResult,
} from '../../lib/scriptRunner';
import type { EncodingType } from '../../types/zenoh';

export interface JavaScriptEditorProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  rows?: number;
  minHeight?: string;
  showTemplates?: boolean;
  showFormatButton?: boolean;
  sampleQuery?: string;
  keyExpr?: string;
  sessionId?: string;
  encoding?: EncodingType | string;
  onTemplateSelect?: (templateName: string, sampleQuery: string) => void;
}

/**
 * Tokenized JavaScript Syntax Highlighter for Code Editor & Viewer.
 */
export const JsHighlightedCode: React.FC<{ code: string }> = React.memo(({ code }) => {
  if (!code) return null;

  const elements: React.ReactNode[] = [];
  // Tokenizer pattern covering Comments, Strings, Keywords, Zenoh/JS Builtins, Literals, Numbers, Function Calls, Operators, Punctuation
  const regex =
    /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"|'(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\'])*'|`(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\`]|[\s\S])*?`)|(\b(?:async|await|function|return|const|let|var|if|else|try|catch|finally|throw|for|while|of|in|switch|case|break|continue|default|new|typeof|instanceof|yield|import|export|from|class|extends|super)\b)|(\b(?:query|params|keyExpr|payload|rawPayload|sessionId|token|timestamp|Math|Date|JSON|Number|String|Array|Object|Boolean|console|Promise|setTimeout|setInterval|Uint8Array|TextDecoder|TextEncoder)\b)|(\b(?:true|false|null|undefined|NaN|Infinity)\b)|(\b\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?\b|0x[0-9a-fA-F]+\b)|([a-zA-Z_$][a-zA-Z0-9_$]*)(?=\s*\()|(=>|[+\-*\/%=<>!&|^~?:]+)|([{}()\[\],;.])/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let tokenKey = 0;

  while ((match = regex.exec(code)) !== null) {
    if (match.index > lastIndex) {
      elements.push(code.slice(lastIndex, match.index));
    }

    const [
      fullMatch,
      commentToken,
      stringToken,
      ,
      ,
      ,
      keywordToken,
      builtinToken,
      literalToken,
      numberToken,
      funcCallToken,
      operatorToken,
      punctToken,
    ] = match;

    if (commentToken) {
      elements.push(
        <span key={tokenKey++} className="text-muted-foreground/75 italic">
          {commentToken}
        </span>
      );
    } else if (stringToken) {
      elements.push(
        <span key={tokenKey++} className="text-emerald-600 dark:text-emerald-400">
          {stringToken}
        </span>
      );
    } else if (keywordToken) {
      elements.push(
        <span key={tokenKey++} className="text-purple-600 dark:text-purple-400 font-semibold">
          {keywordToken}
        </span>
      );
    } else if (builtinToken) {
      elements.push(
        <span key={tokenKey++} className="text-blue-500 dark:text-blue-400 font-medium">
          {builtinToken}
        </span>
      );
    } else if (literalToken) {
      elements.push(
        <span key={tokenKey++} className="text-amber-600 dark:text-amber-400 font-semibold">
          {literalToken}
        </span>
      );
    } else if (numberToken) {
      elements.push(
        <span key={tokenKey++} className="text-amber-500 dark:text-amber-300">
          {numberToken}
        </span>
      );
    } else if (funcCallToken) {
      elements.push(
        <span key={tokenKey++} className="text-sky-600 dark:text-sky-400">
          {funcCallToken}
        </span>
      );
    } else if (operatorToken) {
      elements.push(
        <span key={tokenKey++} className="text-cyan-600 dark:text-cyan-400 font-medium">
          {operatorToken}
        </span>
      );
    } else if (punctToken) {
      elements.push(
        <span key={tokenKey++} className="text-muted-foreground">
          {punctToken}
        </span>
      );
    } else {
      elements.push(fullMatch);
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < code.length) {
    elements.push(code.slice(lastIndex));
  }

  return <>{elements}</>;
});

export const JavaScriptEditor: React.FC<JavaScriptEditorProps> = ({
  value,
  onChange,
  className = '',
  placeholder,
  disabled = false,
  rows = 7,
  minHeight = '140px',
  showTemplates = true,
  showFormatButton = true,
  sampleQuery = 'op=add&a=10&b=20',
  keyExpr = 'rpc/calculator',
  sessionId = '',
  encoding = 'json',
  onTemplateSelect,
}) => {
  const [copied, setCopied] = useState<boolean>(false);
  const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);

  // Synchronized scroll references
  const highlightRef = useRef<HTMLPreElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Dialog sandbox testing states
  const [dialogTestParams, setDialogTestParams] = useState<string>(sampleQuery);
  const [dialogTestResult, setDialogTestResult] = useState<ScriptExecutionResult | null>(null);
  const [isTestingDialogScript, setIsTestingDialogScript] = useState<boolean>(false);

  // Format code handler
  const handleFormat = useCallback(() => {
    if (!value) return;
    const formatted = formatJsCode(value);
    onChange(formatted);
  }, [value, onChange]);

  // Tab key & Shift+Alt+F formatting support
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const target = e.currentTarget;
        const start = target.selectionStart;
        const end = target.selectionEnd;
        const newValue = value.substring(0, start) + '  ' + value.substring(end);
        onChange(newValue);
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 2;
          }
        }, 0);
      } else if ((e.key === 'F' && e.shiftKey && e.altKey) || (e.key === 'l' && e.ctrlKey && e.altKey)) {
        e.preventDefault();
        handleFormat();
      }
    },
    [value, onChange, handleFormat]
  );

  // Copy handler
  const handleCopy = useCallback(() => {
    if (!value) return;
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [value]);

  // Clear handler
  const handleClear = useCallback(() => {
    onChange('');
  }, [onChange]);

  // Template select
  const handleSelectTemplate = (templateName: string) => {
    const tmpl = SCRIPT_TEMPLATES.find((t) => t.name === templateName);
    if (tmpl) {
      onChange(tmpl.code);
      setDialogTestParams(tmpl.sampleQuery);
      setDialogTestResult(null);
      if (onTemplateSelect) {
        onTemplateSelect(tmpl.name, tmpl.sampleQuery);
      }
    }
  };

  // Test script handler in dialog
  const handleTestInDialog = async () => {
    setIsTestingDialogScript(true);
    try {
      const res = await executeInboundScript(
        value,
        {
          key_expr: keyExpr || 'rpc/calculator',
          parameters: dialogTestParams,
          session_id: sessionId,
        },
        encoding
      );
      setDialogTestResult(res);
    } finally {
      setIsTestingDialogScript(false);
    }
  };

  const lineCount = useMemo(() => {
    return value ? value.split(/\r\n|\r|\n/).length : 1;
  }, [value]);

  return (
    <div className={`flex flex-col rounded-md border bg-card text-card-foreground shadow-xs ${className}`}>
      {/* Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-3 py-1.5 shrink-0">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
          <Code2 className="w-3.5 h-3.5 text-blue-500" />
          <span>JavaScript Handler</span>
          <span className="font-mono text-[10px] text-muted-foreground/80">
            (query.params, query.keyExpr)
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Template Selector */}
          {showTemplates && (
            <Select onValueChange={handleSelectTemplate}>
              <SelectTrigger className="h-6 text-[10px] px-2 gap-1 bg-background border-muted w-32">
                <Code2 className="w-3 h-3 text-blue-500 mr-1" />
                <span>Templates</span>
              </SelectTrigger>
              <SelectContent align="end">
                {SCRIPT_TEMPLATES.map((tmpl) => (
                  <SelectItem key={tmpl.name} value={tmpl.name} className="text-xs">
                    <div>
                      <span className="font-medium text-foreground block">{tmpl.name}</span>
                      <span className="text-[10px] text-muted-foreground">{tmpl.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Format Code Button */}
          {showFormatButton && (
            <button
              type="button"
              disabled={disabled || !value.trim()}
              onClick={handleFormat}
              className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-0.5 text-xs font-medium hover:bg-muted hover:text-foreground text-foreground disabled:opacity-50 transition-colors shadow-xs"
              title="Format JavaScript (Shift+Alt+F)"
            >
              <Sparkles className="w-3 h-3 text-blue-500" />
              <span>Format</span>
            </button>
          )}

          {/* Copy Button */}
          <button
            type="button"
            disabled={disabled || !value}
            onClick={handleCopy}
            className="inline-flex items-center gap-1 rounded border bg-background px-2 py-0.5 text-xs font-medium hover:bg-muted disabled:opacity-50 transition-colors"
            title="Copy script code"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
          </button>

          {/* Clear Button */}
          <button
            type="button"
            disabled={disabled || !value}
            onClick={handleClear}
            className="inline-flex items-center gap-1 rounded border bg-background px-2 py-0.5 text-xs font-medium hover:bg-destructive/10 hover:text-destructive disabled:opacity-50 transition-colors"
            title="Clear script"
          >
            <Trash2 className="w-3 h-3" />
          </button>

          {/* Open in Dialog Button */}
          <button
            type="button"
            onClick={() => setIsDialogOpen(true)}
            className="inline-flex items-center gap-1 rounded border bg-background px-2 py-0.5 text-xs font-medium hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Open script in full editor dialog"
          >
            <Maximize2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Editor Body with Synchronized Syntax Highlighting */}
      <div
        className="relative flex-1 overflow-hidden bg-background"
        style={{ minHeight }}
      >
        {/* Syntax-highlighted background layer */}
        {value ? (
          <pre
            ref={highlightRef}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 m-0 overflow-auto p-2.5 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all select-none text-foreground [tab-size:2]"
          >
            <JsHighlightedCode code={value} />
            {value.endsWith('\n') ? ' ' : ''}
          </pre>
        ) : null}

        {/* Editable transparent input area */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onScroll={(e) => {
            if (highlightRef.current) {
              highlightRef.current.scrollTop = e.currentTarget.scrollTop;
              highlightRef.current.scrollLeft = e.currentTarget.scrollLeft;
            }
          }}
          placeholder={placeholder || '// Write JavaScript query handler logic.\n// Return an object, number, string, or boolean.'}
          disabled={disabled}
          rows={rows}
          className={`relative z-10 w-full h-full resize-none border-0 m-0 bg-transparent p-2.5 font-mono text-xs leading-relaxed placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 whitespace-pre-wrap break-all [tab-size:2] ${
            value ? 'text-transparent caret-foreground selection:bg-blue-500/30' : 'text-foreground'
          }`}
          spellCheck={false}
        />

        {/* Interactive Bottom-Right Corner Expand Target (Replaces CSS resize grip) */}
        <button
          type="button"
          onClick={() => setIsDialogOpen(true)}
          className="absolute right-1 bottom-1 p-1 rounded-tl-md rounded-br-sm bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground transition-all shadow-xs z-20 group"
          title="Open in Full Dialog Editor"
        >
          <Maximize2 className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
        </button>
      </div>

      {/* Footer Metrics Bar */}
      <div className="flex items-center justify-between border-t bg-muted/20 px-3 py-1 text-[11px] text-muted-foreground shrink-0 font-mono">
        <div className="flex items-center gap-2">
          <span>{lineCount} {lineCount === 1 ? 'line' : 'lines'}</span>
          <span>•</span>
          <span>{value.length} chars</span>
        </div>
        <div className="flex items-center gap-1.5 text-blue-500/90 font-sans">
          <span>ECMAScript 2022</span>
        </div>
      </div>

      {/* Fullscreen / Expanded Code Editor Dialog */}
      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open);
        }}
      >
        <DialogContent className="max-w-4xl w-[92vw] h-[85vh] flex flex-col p-0 gap-0 overflow-hidden bg-background">
          <DialogHeader className="p-4 border-b bg-card shrink-0">
            <div className="flex items-center justify-between pr-6">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-blue-500/10 text-blue-500">
                  <Code2 className="w-4 h-4" />
                </div>
                <div>
                  <DialogTitle className="text-sm font-semibold text-foreground">
                    JavaScript Queryable Script Editor
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground">
                    Write dynamic query logic in JavaScript. Output is automatically converted to Zenoh reply sample.
                  </DialogDescription>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Template Selector in Dialog */}
                <Select onValueChange={handleSelectTemplate}>
                  <SelectTrigger className="h-7 text-xs px-2 gap-1 bg-background border-muted w-36">
                    <Code2 className="w-3 h-3 text-blue-500 mr-1" />
                    <span>Templates</span>
                  </SelectTrigger>
                  <SelectContent align="end">
                    {SCRIPT_TEMPLATES.map((tmpl) => (
                      <SelectItem key={tmpl.name} value={tmpl.name} className="text-xs">
                        <div>
                          <span className="font-medium text-foreground block">{tmpl.name}</span>
                          <span className="text-[10px] text-muted-foreground">{tmpl.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Format Code */}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleFormat}
                  className="h-7 text-xs gap-1.5"
                  title="Format Code (Shift+Alt+F)"
                >
                  <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                  <span>Format Code</span>
                </Button>

                {/* Copy */}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleCopy}
                  className="h-7 text-xs gap-1"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </Button>
              </div>
            </div>
          </DialogHeader>

          {/* Dialog Editor Body Grid: Code Editor + Interactive Live Tester */}
          <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-border overflow-hidden">
            {/* Left 2 Cols: Code Editor with Line Numbers */}
            <div className="lg:col-span-2 flex flex-col h-full bg-background overflow-hidden">
              <div className="relative flex-1 min-h-0 overflow-auto flex">
                {/* Line numbers gutter */}
                <div className="shrink-0 py-3 px-2.5 bg-muted/20 border-r border-border/50 text-right select-none font-mono text-xs text-muted-foreground/60 leading-relaxed min-w-[40px]">
                  {Array.from({ length: lineCount }).map((_, i) => (
                    <div key={i}>{i + 1}</div>
                  ))}
                </div>

                {/* Code Area with Highlighting */}
                <div className="relative flex-1 min-w-0 h-full">
                  {value && (
                    <pre
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 m-0 overflow-auto p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all select-none text-foreground [tab-size:2]"
                    >
                      <JsHighlightedCode code={value} />
                      {value.endsWith('\n') ? ' ' : ''}
                    </pre>
                  )}

                  <textarea
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="// Enter JavaScript handler code here..."
                    className={`relative z-10 w-full h-full resize-none border-0 m-0 bg-transparent p-3 font-mono text-xs leading-relaxed placeholder:text-muted-foreground focus:outline-none whitespace-pre-wrap break-all [tab-size:2] ${
                      value ? 'text-transparent caret-foreground selection:bg-blue-500/30' : 'text-foreground'
                    }`}
                    spellCheck={false}
                  />
                </div>
              </div>
            </div>

            {/* Right 1 Col: Live Sandbox Test Execution */}
            <div className="flex flex-col h-full bg-card/30 p-4 space-y-3 overflow-y-auto">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Play className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Interactive Test Sandbox</span>
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="default"
                  onClick={handleTestInDialog}
                  disabled={isTestingDialogScript}
                  className="h-6 text-xs px-2.5 gap-1.5"
                >
                  {isTestingDialogScript ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Play className="w-3 h-3 text-emerald-300" />
                  )}
                  <span>Run Test</span>
                </Button>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">
                  Test Query Parameters
                </label>
                <Input
                  value={dialogTestParams}
                  onChange={(e) => setDialogTestParams(e.target.value)}
                  placeholder="e.g. op=add&a=10&b=20"
                  className="h-8 font-mono text-xs bg-background"
                />
                <span className="text-[10px] text-muted-foreground block">
                  Accessible in script as <code className="text-foreground">query.params.a</code>
                </span>
              </div>

              {/* Execution Results */}
              <div className="space-y-1.5 flex-1 flex flex-col min-h-0">
                <label className="text-[11px] font-medium text-muted-foreground">
                  Computed Output Preview
                </label>
                {dialogTestResult ? (
                  <div className="flex-1 rounded-md border bg-background p-3 flex flex-col font-mono text-xs overflow-hidden">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground pb-2 mb-2 border-b">
                      <span
                        className={
                          dialogTestResult.success
                            ? 'text-emerald-500 font-semibold flex items-center gap-1'
                            : 'text-destructive font-semibold flex items-center gap-1'
                        }
                      >
                        {dialogTestResult.success ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : (
                          <AlertCircle className="w-3.5 h-3.5" />
                        )}
                        {dialogTestResult.success ? 'Success (200 OK)' : 'Execution Error'}
                      </span>
                      <span>{dialogTestResult.executionTimeMs} ms</span>
                    </div>
                    <pre className="flex-1 overflow-auto text-xs text-foreground whitespace-pre-wrap">
                      {typeof dialogTestResult.resultValue === 'object'
                        ? JSON.stringify(dialogTestResult.resultValue, null, 2)
                        : String(dialogTestResult.resultValue)}
                    </pre>
                  </div>
                ) : (
                  <div className="flex-1 rounded-md border border-dashed bg-muted/10 p-4 flex flex-col items-center justify-center text-center text-xs text-muted-foreground">
                    <Play className="w-5 h-5 text-muted-foreground/40 mb-1" />
                    <span>Click "Run Test" to evaluate script output with parameters</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="p-3 border-t bg-card shrink-0 flex items-center justify-between">
            <div className="text-[11px] text-muted-foreground font-mono">
              Press <kbd className="px-1 py-0.5 bg-muted rounded border text-[10px]">Tab</kbd> to indent • <kbd className="px-1 py-0.5 bg-muted rounded border text-[10px]">Shift+Alt+F</kbd> to format
            </div>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => setIsDialogOpen(false)}
              className="h-8 text-xs font-medium px-4"
            >
              Done & Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default JavaScriptEditor;
