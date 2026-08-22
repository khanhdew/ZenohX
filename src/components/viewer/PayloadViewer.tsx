import React, { useState, useMemo, useCallback } from 'react';
import {
  Copy,
  Check,
  Code,
  FileText,
  Binary,
  Braces,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  WrapText,
  ListTree,
} from 'lucide-react';
import {
  bytesToUint8Array,
  formatByteSize,
  toHexDump,
  tryFormatJson,
  tryFormatCbor,
  detectEncoding,
} from '../../lib/formatters';
import type { EncodingType } from '../../types/zenoh';

export type ViewerTab = 'json' | 'cbor' | 'text' | 'hex' | 'raw';

export interface PayloadViewerProps {
  payload?: Uint8Array | number[] | string | null;
  encoding?: EncodingType | string;
  defaultTab?: ViewerTab;
  className?: string;
  showMetrics?: boolean;
  maxHeight?: string | number;
}

/**
 * Tokenized JSON syntax highlighter for Code View.
 */
export const JsonHighlightedCode: React.FC<{ code: string }> = React.memo(({ code }) => {
  if (!code) return null;

  const elements: React.ReactNode[] = [];
  const regex = /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?|[{}\[\],:]/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIndex = 0;

  while ((match = regex.exec(code)) !== null) {
    // Plain text before token (whitespace, indentation)
    if (match.index > lastIndex) {
      elements.push(code.slice(lastIndex, match.index));
    }

    const [fullMatch, stringToken, , colonSuffix, keywordToken] = match;

    if (stringToken) {
      if (colonSuffix) {
        // Key
        elements.push(
          <span key={keyIndex++} className="text-sky-600 dark:text-sky-400 font-medium">
            {stringToken}
          </span>
        );
        elements.push(
          <span key={keyIndex++} className="text-muted-foreground">
            {colonSuffix}
          </span>
        );
      } else {
        // String value
        elements.push(
          <span key={keyIndex++} className="text-emerald-600 dark:text-emerald-400">
            {stringToken}
          </span>
        );
      }
    } else if (keywordToken) {
      if (keywordToken === 'true' || keywordToken === 'false') {
        elements.push(
          <span key={keyIndex++} className="text-purple-600 dark:text-purple-400 font-semibold">
            {keywordToken}
          </span>
        );
      } else if (keywordToken === 'null') {
        elements.push(
          <span key={keyIndex++} className="text-rose-500/80 dark:text-rose-400/80 italic">
            {keywordToken}
          </span>
        );
      }
    } else if (/^-?\d/.test(fullMatch)) {
      // Number
      elements.push(
        <span key={keyIndex++} className="text-amber-600 dark:text-amber-400">
          {fullMatch}
        </span>
      );
    } else {
      // Punctuation
      elements.push(
        <span key={keyIndex++} className="text-muted-foreground">
          {fullMatch}
        </span>
      );
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < code.length) {
    elements.push(code.slice(lastIndex));
  }

  return <>{elements}</>;
});

/**
 * Recursive JSON Tree Node component for collapsible tree view.
 */
interface JsonTreeNodeProps {
  name?: string;
  value: unknown;
  depth?: number;
  isLast?: boolean;
  defaultExpanded?: boolean;
}

const JsonTreeNode: React.FC<JsonTreeNodeProps> = ({
  name,
  value,
  depth = 0,
  isLast = true,
  defaultExpanded = true,
}) => {
  const [expanded, setExpanded] = useState<boolean>(defaultExpanded || depth < 2);

  const toggleExpanded = () => setExpanded((prev) => !prev);

  // Render Primitives
  if (value === null) {
    return (
      <div className="font-mono text-xs leading-5 hover:bg-muted/40 px-1 rounded flex items-center">
        <span style={{ marginLeft: `${depth * 14}px` }} />
        {name !== undefined && (
          <span className="text-sky-600 dark:text-sky-400 font-semibold mr-1.5">
            "{name}":
          </span>
        )}
        <span className="text-rose-500/80 dark:text-rose-400/80 italic">null</span>
        {!isLast && <span className="text-muted-foreground">,</span>}
      </div>
    );
  }

  if (typeof value === 'boolean') {
    return (
      <div className="font-mono text-xs leading-5 hover:bg-muted/40 px-1 rounded flex items-center">
        <span style={{ marginLeft: `${depth * 14}px` }} />
        {name !== undefined && (
          <span className="text-sky-600 dark:text-sky-400 font-semibold mr-1.5">
            "{name}":
          </span>
        )}
        <span className="font-semibold text-purple-600 dark:text-purple-400">
          {value ? 'true' : 'false'}
        </span>
        {!isLast && <span className="text-muted-foreground">,</span>}
      </div>
    );
  }

  if (typeof value === 'number' || typeof value === 'bigint') {
    return (
      <div className="font-mono text-xs leading-5 hover:bg-muted/40 px-1 rounded flex items-center">
        <span style={{ marginLeft: `${depth * 14}px` }} />
        {name !== undefined && (
          <span className="text-sky-600 dark:text-sky-400 font-semibold mr-1.5">
            "{name}":
          </span>
        )}
        <span className="font-mono text-amber-600 dark:text-amber-400">
          {value.toString()}
        </span>
        {!isLast && <span className="text-muted-foreground">,</span>}
      </div>
    );
  }

  if (typeof value === 'string') {
    return (
      <div className="font-mono text-xs leading-5 hover:bg-muted/40 px-1 rounded flex items-center truncate">
        <span style={{ marginLeft: `${depth * 14}px` }} />
        {name !== undefined && (
          <span className="text-sky-600 dark:text-sky-400 font-semibold mr-1.5">
            "{name}":
          </span>
        )}
        <span className="text-emerald-600 dark:text-emerald-400 truncate">
          "{value}"
        </span>
        {!isLast && <span className="text-muted-foreground">,</span>}
      </div>
    );
  }

  // Render Arrays
  if (Array.isArray(value)) {
    const itemCount = value.length;
    if (itemCount === 0) {
      return (
        <div className="font-mono text-xs leading-5 hover:bg-muted/40 px-1 rounded flex items-center">
          <span style={{ marginLeft: `${depth * 14}px` }} />
          {name !== undefined && (
            <span className="text-sky-600 dark:text-sky-400 font-semibold mr-1.5">
              "{name}":
            </span>
          )}
          <span className="text-muted-foreground">[]</span>
          {!isLast && <span className="text-muted-foreground">,</span>}
        </div>
      );
    }

    return (
      <div>
        <div
          onClick={toggleExpanded}
          className="font-mono text-xs leading-5 hover:bg-muted/40 px-1 rounded flex items-center cursor-pointer select-none"
        >
          <span style={{ marginLeft: `${depth * 14}px` }} />
          <span className="text-muted-foreground mr-1">
            {expanded ? <ChevronDown className="w-3 h-3 inline" /> : <ChevronRight className="w-3 h-3 inline" />}
          </span>
          {name !== undefined && (
            <span className="text-sky-600 dark:text-sky-400 font-semibold mr-1.5">
              "{name}":
            </span>
          )}
          <span className="text-muted-foreground font-mono">[{itemCount}]</span>
          {!expanded && <span className="text-muted-foreground ml-1">...</span>}
          {!isLast && !expanded && <span className="text-muted-foreground">,</span>}
        </div>

        {expanded && (
          <div>
            {value.map((item, idx) => (
              <JsonTreeNode
                key={idx}
                value={item}
                depth={depth + 1}
                isLast={idx === itemCount - 1}
                defaultExpanded={defaultExpanded}
              />
            ))}
            <div className="font-mono text-xs leading-5 px-1">
              <span style={{ marginLeft: `${depth * 14}px` }} />
              <span className="text-muted-foreground">]</span>
              {!isLast && <span className="text-muted-foreground">,</span>}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Render Objects
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    const keyCount = entries.length;
    if (keyCount === 0) {
      return (
        <div className="font-mono text-xs leading-5 hover:bg-muted/40 px-1 rounded flex items-center">
          <span style={{ marginLeft: `${depth * 14}px` }} />
          {name !== undefined && (
            <span className="text-sky-600 dark:text-sky-400 font-semibold mr-1.5">
              "{name}":
            </span>
          )}
          <span className="text-muted-foreground">{'{}'}</span>
          {!isLast && <span className="text-muted-foreground">,</span>}
        </div>
      );
    }

    return (
      <div>
        <div
          onClick={toggleExpanded}
          className="font-mono text-xs leading-5 hover:bg-muted/40 px-1 rounded flex items-center cursor-pointer select-none"
        >
          <span style={{ marginLeft: `${depth * 14}px` }} />
          <span className="text-muted-foreground mr-1">
            {expanded ? <ChevronDown className="w-3 h-3 inline" /> : <ChevronRight className="w-3 h-3 inline" />}
          </span>
          {name !== undefined && (
            <span className="text-sky-600 dark:text-sky-400 font-semibold mr-1.5">
              "{name}":
            </span>
          )}
          <span className="text-muted-foreground">{'{' + `${keyCount} keys` + '}'}</span>
          {!expanded && <span className="text-muted-foreground ml-1">...</span>}
          {!isLast && !expanded && <span className="text-muted-foreground">,</span>}
        </div>

        {expanded && (
          <div>
            {entries.map(([k, v], idx) => (
              <JsonTreeNode
                key={k}
                name={k}
                value={v}
                depth={depth + 1}
                isLast={idx === keyCount - 1}
                defaultExpanded={defaultExpanded}
              />
            ))}
            <div className="font-mono text-xs leading-5 px-1">
              <span style={{ marginLeft: `${depth * 14}px` }} />
              <span className="text-muted-foreground">{'}'}</span>
              {!isLast && <span className="text-muted-foreground">,</span>}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="font-mono text-xs leading-5 px-1">
      <span style={{ marginLeft: `${depth * 14}px` }} />
      <span>{String(value)}</span>
    </div>
  );
};

export const PayloadViewer: React.FC<PayloadViewerProps> = ({
  payload,
  encoding,
  defaultTab,
  className = '',
  showMetrics = true,
  maxHeight = '420px',
}) => {
  const bytes = useMemo(() => bytesToUint8Array(payload), [payload]);
  const byteCount = bytes.length;

  // Auto-detect initial tab if not explicitly given
  const initialTab = useMemo<ViewerTab>(() => {
    if (defaultTab) return defaultTab;
    if (encoding) {
      const lower = encoding.toLowerCase();
      if (lower === 'json' || lower === 'cbor' || lower === 'text' || lower === 'raw') {
        return lower as ViewerTab;
      }
    }
    const detected = detectEncoding(bytes);
    return detected as ViewerTab;
  }, [defaultTab, encoding, bytes]);

  const [activeTab, setActiveTab] = useState<ViewerTab>(initialTab);
  const [viewMode, setViewMode] = useState<'tree' | 'code'>('code');
  const [wordWrap, setWordWrap] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  // Sync tab if encoding prop changes dynamically
  React.useEffect(() => {
    if (encoding) {
      const enc = encoding.toLowerCase() as ViewerTab;
      if (['json', 'cbor', 'text', 'hex', 'raw'].includes(enc)) {
        setActiveTab(enc);
      }
    }
  }, [encoding]);

  // Decode content based on active tab
  const tabData = useMemo(() => {
    if (byteCount === 0) {
      return { text: '', parsedJson: null, error: null };
    }

    switch (activeTab) {
      case 'json': {
        const res = tryFormatJson(bytes, 2);
        return {
          text: res.formatted,
          parsedJson: res.success ? res.data : null,
          error: res.success ? null : (res.error || 'Invalid JSON'),
        };
      }

      case 'cbor': {
        const res = tryFormatCbor(bytes, 2);
        return {
          text: res.success ? res.formatted : toHexDump(bytes),
          parsedJson: res.success ? res.data : null,
          error: res.success ? null : (res.error || 'Failed to decode CBOR payload'),
        };
      }

      case 'text': {
        try {
          const text = new TextDecoder('utf-8').decode(bytes);
          return { text, parsedJson: null, error: null };
        } catch (err) {
          return {
            text: toHexDump(bytes),
            parsedJson: null,
            error: 'UTF-8 decoding failed, displaying Hex dump fallback',
          };
        }
      }

      case 'hex':
      case 'raw': {
        return {
          text: toHexDump(bytes),
          parsedJson: null,
          error: null,
        };
      }

      default:
        return { text: '', parsedJson: null, error: null };
    }
  }, [bytes, byteCount, activeTab]);

  // Copy handler
  const handleCopy = useCallback(() => {
    if (!tabData.text && byteCount === 0) return;
    navigator.clipboard.writeText(tabData.text || '').then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [tabData.text, byteCount]);

  const tabs: { id: ViewerTab; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'json', label: 'JSON', icon: Braces },
    { id: 'cbor', label: 'CBOR', icon: Code },
    { id: 'text', label: 'Text', icon: FileText },
    { id: 'hex', label: 'HEX', icon: Binary },
    { id: 'raw', label: 'RAW', icon: Binary },
  ];

  return (
    <div className={`flex flex-col rounded-md border bg-card text-card-foreground shadow-xs ${className}`}>
      {/* Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-3 py-1.5">
        {/* Navigation Tabs */}
        <div className="flex items-center space-x-1">
          {tabs.map((t) => {
            const Icon = t.icon;
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
                type="button"
              >
                <Icon className="w-3 h-3" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Right Actions & Metrics */}
        <div className="flex items-center gap-2">
          {/* Tree vs Code Mode Toggle for JSON/CBOR */}
          {(activeTab === 'json' || activeTab === 'cbor') && tabData.parsedJson !== null && (
            <div className="flex items-center rounded border bg-muted p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setViewMode('code')}
                className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs ${
                  viewMode === 'code' ? 'bg-background font-medium text-foreground shadow-xs' : 'text-muted-foreground'
                }`}
                title="Code View"
              >
                <Code className="w-3 h-3" />
                Code
              </button>
              <button
                type="button"
                onClick={() => setViewMode('tree')}
                className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs ${
                  viewMode === 'tree' ? 'bg-background font-medium text-foreground shadow-xs' : 'text-muted-foreground'
                }`}
                title="Tree View"
              >
                <ListTree className="w-3 h-3" />
                Tree
              </button>
            </div>
          )}

          {/* Word Wrap Toggle */}
          {(activeTab === 'text' || (viewMode === 'code' && (activeTab === 'json' || activeTab === 'cbor'))) && (
            <button
              type="button"
              onClick={() => setWordWrap(!wordWrap)}
              className={`rounded p-1 text-xs hover:bg-muted ${
                wordWrap ? 'text-foreground bg-muted' : 'text-muted-foreground'
              }`}
              title="Toggle Word Wrap"
            >
              <WrapText className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Size Metric */}
          {showMetrics && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
              {formatByteSize(byteCount)}
            </span>
          )}

          {/* Copy Button */}
          <button
            type="button"
            onClick={handleCopy}
            disabled={byteCount === 0}
            className="flex items-center gap-1 rounded bg-muted hover:bg-muted/80 px-2 py-0.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            title="Copy payload to clipboard"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-emerald-500" />
                <span className="text-[11px] text-emerald-500 font-semibold">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                <span className="text-[11px]">Copy</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error / Warning Notice if decode failed */}
      {tabData.error && (
        <div className="flex items-center gap-1.5 border-b bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{tabData.error}</span>
        </div>
      )}

      {/* Main Payload Content Body */}
      <div
        className="overflow-auto p-3 font-mono text-xs bg-background"
        style={{ maxHeight }}
      >
        {byteCount === 0 ? (
          <div className="flex items-center justify-center p-6 text-muted-foreground italic text-xs">
            Payload is empty (0 bytes)
          </div>
        ) : (activeTab === 'json' || activeTab === 'cbor') && viewMode === 'tree' && tabData.parsedJson !== null ? (
          <div className="space-y-0.5">
            <JsonTreeNode value={tabData.parsedJson} defaultExpanded={true} />
          </div>
        ) : (
          <pre
            className={`font-mono text-xs text-foreground select-text ${
              wordWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre overflow-x-auto'
            }`}
          >
            {(activeTab === 'json' || activeTab === 'cbor') && tabData.parsedJson !== null ? (
              <JsonHighlightedCode code={tabData.text} />
            ) : (
              tabData.text
            )}
          </pre>
        )}
      </div>
    </div>
  );
};

export default PayloadViewer;
