import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
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
  Boxes,
} from 'lucide-react';
import {
  bytesToUint8Array,
  formatByteSize,
  toHexDump,
  tryFormatJson,
  tryFormatCbor,
  detectEncoding,
} from '../../lib/formatters';
import { decodeProtobufPayload } from '../../lib/protobufEngine';
import { useProtoStore } from '../../stores/protoStore';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Button } from '../ui/button';
import { ProtoManagerDialog } from '../proto/ProtoManagerDialog';
import type { EncodingType } from '../../types/zenoh';

export type ViewerTab = 'json' | 'cbor' | 'text' | 'protobuf' | 'hex' | 'raw';

export interface PayloadViewerProps {
  payload?: Uint8Array | number[] | string | null;
  encoding?: EncodingType | string;
  defaultTab?: ViewerTab;
  className?: string;
  showMetrics?: boolean;
  maxHeight?: string | number;
  keyExpr?: string;
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
  keyExpr,
}) => {
  const bytes = useMemo(() => bytesToUint8Array(payload), [payload]);
  const byteCount = bytes.length;

  // Protobuf store hooks
  const schemas = useProtoStore((s) => s.schemas);
  const mappings = useProtoStore((s) => s.mappings);
  const findMappingForKey = useProtoStore((s) => s.findMappingForKey);
  const getAllMessageTypes = useProtoStore((s) => s.getAllMessageTypes);
  const getCompiledRoot = useProtoStore((s) => s.getCompiledRoot);
  const getGlobalRoot = useProtoStore((s) => s.getGlobalRoot);

  const [isProtoDialogOpen, setIsProtoDialogOpen] = useState<boolean>(false);

  // All available message types
  const allMessageTypes = useMemo(() => {
    return getAllMessageTypes();
  }, [schemas, getAllMessageTypes]);

  // Find matching topic mapping if keyExpr is provided
  const mappedType = useMemo(() => {
    if (!keyExpr) return undefined;
    const mapping = findMappingForKey(keyExpr);
    return mapping?.messageTypeName;
  }, [keyExpr, mappings, findMappingForKey]);

  // Selected proto message type state
  const [selectedProtoType, setSelectedProtoType] = useState<string>(() => {
    if (mappedType) return mappedType;
    const all = getAllMessageTypes();
    return all.length > 0 ? all[0].typeName : '';
  });

  const prevKeyExprRef = useRef<string | undefined>(keyExpr);

  // Sync selectedProtoType on keyExpr change, mapping change, or schema reload
  useEffect(() => {
    if (prevKeyExprRef.current !== keyExpr) {
      prevKeyExprRef.current = keyExpr;
      if (mappedType) {
        setSelectedProtoType(mappedType);
        return;
      }
    }

    if (mappedType && !selectedProtoType) {
      setSelectedProtoType(mappedType);
      return;
    }

    if (!selectedProtoType || !allMessageTypes.some((t) => t.typeName === selectedProtoType)) {
      if (mappedType) {
        setSelectedProtoType(mappedType);
      } else if (allMessageTypes.length > 0) {
        setSelectedProtoType(allMessageTypes[0].typeName);
      } else {
        setSelectedProtoType('');
      }
    }
  }, [keyExpr, mappedType, allMessageTypes, selectedProtoType]);

  // Auto-detect initial tab if not explicitly given
  const initialTab = useMemo<ViewerTab>(() => {
    if (defaultTab) return defaultTab;
    if (encoding) {
      const lower = encoding.toLowerCase();
      if (['json', 'cbor', 'text', 'protobuf', 'hex', 'raw'].includes(lower)) {
        return lower as ViewerTab;
      }
      if (lower === 'proto' || lower === 'application/protobuf' || lower === 'application/x-protobuf') {
        return 'protobuf';
      }
    }
    const detected = detectEncoding(bytes, { keyExpr });
    return detected as ViewerTab;
  }, [defaultTab, encoding, bytes, keyExpr]);

  const [activeTab, setActiveTab] = useState<ViewerTab>(initialTab);
  const [viewMode, setViewMode] = useState<'tree' | 'code'>('code');
  const [wordWrap, setWordWrap] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  // Sync tab if encoding prop changes dynamically
  useEffect(() => {
    if (encoding) {
      const enc = encoding.toLowerCase();
      if (['json', 'cbor', 'text', 'protobuf', 'hex', 'raw'].includes(enc)) {
        setActiveTab(enc as ViewerTab);
      } else if (enc === 'proto' || enc === 'application/protobuf' || enc === 'application/x-protobuf') {
        setActiveTab('protobuf');
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

      case 'protobuf': {
        if (schemas.length === 0) {
          return {
            text: toHexDump(bytes),
            parsedJson: null,
            error: 'No Protobuf schemas registered. Open Schema Manager to add .proto schemas.',
          };
        }

        if (!selectedProtoType) {
          return {
            text: toHexDump(bytes),
            parsedJson: null,
            error: 'No Protobuf message type selected or mapped for this topic.',
          };
        }

        const matchedSchema = schemas.find((s) => s.messageTypes.includes(selectedProtoType));
        const root = (matchedSchema ? getCompiledRoot(matchedSchema.id) : null) || getGlobalRoot();

        try {
          const decoded = decodeProtobufPayload(root, selectedProtoType, bytes);
          const formatted = JSON.stringify(decoded, null, 2);
          return {
            text: formatted,
            parsedJson: decoded,
            error: null,
          };
        } catch (err: any) {
          return {
            text: toHexDump(bytes),
            parsedJson: null,
            error: err?.message || String(err),
          };
        }
      }

      case 'text': {
        try {
          const text = new TextDecoder('utf-8').decode(bytes);
          return { text, parsedJson: null, error: null };
        } catch {
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
  }, [bytes, byteCount, activeTab, selectedProtoType, schemas, getCompiledRoot, getGlobalRoot]);

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
    { id: 'protobuf', label: 'PROTOBUF', icon: Boxes },
    { id: 'text', label: 'Text', icon: FileText },
    { id: 'hex', label: 'HEX', icon: Binary },
    { id: 'raw', label: 'RAW', icon: Binary },
  ];

  const isStructuredTab = activeTab === 'json' || activeTab === 'cbor' || activeTab === 'protobuf';

  return (
    <>
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

          {/* Right Actions, Message Type Selector & Metrics */}
          <div className="flex items-center gap-2">
            {/* Protobuf Controls: Message Type Selector & Schema Manager Button */}
            {activeTab === 'protobuf' && (
              <div className="flex items-center gap-1.5">
                {schemas.length === 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsProtoDialogOpen(true)}
                    className="h-6 text-[11px] px-2 gap-1 text-primary hover:text-primary border-dashed"
                    title="Open Protobuf Schema Manager to add schemas"
                  >
                    <Boxes className="w-3 h-3" />
                    <span>Add Schema</span>
                  </Button>
                ) : (
                  <>
                    <Select value={selectedProtoType} onValueChange={(val) => setSelectedProtoType(val)}>
                      <SelectTrigger
                        className="h-6 text-[11px] min-w-[130px] max-w-[200px] px-2 py-0 bg-background"
                        title={`Protobuf Type: ${selectedProtoType || 'None selected'}`}
                      >
                        <SelectValue placeholder="Select proto type..." />
                      </SelectTrigger>
                      <SelectContent>
                        {schemas.map((schema) => {
                          const types = schema.messageTypes || [];
                          if (types.length === 0) return null;
                          return (
                            <SelectGroup key={schema.id}>
                              <SelectLabel className="text-[10px] font-semibold text-muted-foreground uppercase">
                                {schema.name}
                              </SelectLabel>
                              {types.map((type) => (
                                <SelectItem key={`${schema.id}-${type}`} value={type} className="text-xs font-mono">
                                  {type}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          );
                        })}
                      </SelectContent>
                    </Select>

                    <button
                      type="button"
                      onClick={() => setIsProtoDialogOpen(true)}
                      className="flex items-center gap-1 rounded bg-muted hover:bg-muted/80 px-2 py-0.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                      title="Manage Protobuf Schemas & Topic Mappings"
                    >
                      <Boxes className="w-3 h-3 text-primary" />
                      <span className="text-[11px] hidden sm:inline">Schemas</span>
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Tree vs Code Mode Toggle for JSON/CBOR/Protobuf */}
            {isStructuredTab && tabData.parsedJson !== null && (
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
            {(activeTab === 'text' || (viewMode === 'code' && isStructuredTab)) && (
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
          ) : isStructuredTab && viewMode === 'tree' && tabData.parsedJson !== null ? (
            <div className="space-y-0.5">
              <JsonTreeNode value={tabData.parsedJson} defaultExpanded={true} />
            </div>
          ) : (
            <pre
              className={`font-mono text-xs text-foreground select-text ${
                wordWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre overflow-x-auto'
              }`}
            >
              {isStructuredTab && tabData.parsedJson !== null ? (
                <JsonHighlightedCode code={tabData.text} />
              ) : (
                tabData.text
              )}
            </pre>
          )}
        </div>
      </div>

      {/* Protobuf Schema Manager Dialog */}
      <ProtoManagerDialog
        isOpen={isProtoDialogOpen}
        onClose={() => setIsProtoDialogOpen(false)}
      />
    </>
  );
};

export default PayloadViewer;
