import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  Sparkles,
  Minimize2,
  Copy,
  Check,
  Trash2,
  AlertCircle,
  CheckCircle2,
  FileCode,
  Braces,
  Code,
  FileText,
  Binary,
  BookOpen,
  ChevronDown,
} from 'lucide-react';
import {
  encodePayload,
  formatByteSize,
  tryFormatJson,
} from '../../lib/formatters';
import { JsonHighlightedCode } from './PayloadViewer';
import type { EncodingType } from '../../types/zenoh';

export interface PayloadEditorProps {
  value: string;
  onChange: (value: string) => void;
  encoding: EncodingType | string;
  onEncodingChange?: (encoding: EncodingType) => void;
  className?: string;
  style?: React.CSSProperties;
  placeholder?: string;
  disabled?: boolean;
  showTemplates?: boolean;
  showEncodingSelector?: boolean;
  rows?: number;
}

export interface PayloadTemplate {
  name: string;
  description: string;
  encoding: EncodingType;
  content: string;
}

export const PAYLOAD_TEMPLATES: PayloadTemplate[] = [
  {
    name: 'Telemetry / Sensor Reading',
    description: 'Standard IoT metrics payload with timestamp and sensor values',
    encoding: 'json',
    content: JSON.stringify(
      {
        sensor_id: 'temp-sensor-01',
        temperature: 24.5,
        humidity: 55.2,
        unit: 'celsius',
        timestamp: Date.now(),
      },
      null,
      2
    ),
  },
  {
    name: 'RPC Request Command',
    description: 'Remote procedure call request payload with parameters',
    encoding: 'json',
    content: JSON.stringify(
      {
        command: 'get_diagnostics',
        device_id: 'robot-arm-01',
        params: {
          include_logs: true,
          timeout_ms: 5000,
        },
      },
      null,
      2
    ),
  },
  {
    name: 'Key-Value Configuration',
    description: 'State configuration map with versioning',
    encoding: 'json',
    content: JSON.stringify(
      {
        mode: 'autonomous',
        speed_limit: 100,
        safety_stop: false,
        version: 1,
      },
      null,
      2
    ),
  },
  {
    name: 'Batch Array / List',
    description: 'JSON array containing batch items',
    encoding: 'json',
    content: JSON.stringify(
      [
        { id: 1, name: 'Item A', status: 'ready' },
        { id: 2, name: 'Item B', status: 'processing' },
      ],
      null,
      2
    ),
  },
  {
    name: 'Plain Text Message',
    description: 'Simple UTF-8 text message',
    encoding: 'text',
    content: 'Hello Zenoh distributed network!',
  },
  {
    name: 'Raw Binary Hex',
    description: 'Hexadecimal byte stream representation',
    encoding: 'raw',
    content: '0x48 0x65 0x6c 0x6c 0x6f 0x2c 0x20 0x5a 0x65 0x6e 0x6f 0x68 0x21',
  },
];

export const PayloadEditor: React.FC<PayloadEditorProps> = ({
  value,
  onChange,
  encoding,
  onEncodingChange,
  className = '',
  style,
  placeholder,
  disabled = false,
  showTemplates = true,
  showEncodingSelector = true,
  rows = 8,
}) => {
  const [copied, setCopied] = useState<boolean>(false);
  const [templateMenuOpen, setTemplateMenuOpen] = useState<boolean>(false);

  const currentEncoding = (encoding || 'json').toLowerCase() as EncodingType;

  const highlightRef = useRef<HTMLPreElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isJsonLike = currentEncoding === 'json' || currentEncoding === 'cbor';

  // Real-time encoding validation and size computation
  const validation = useMemo(() => {
    if (!value || value.trim().length === 0) {
      return { isValid: true, byteLength: 0, error: undefined };
    }
    const res = encodePayload(value, currentEncoding);
    return {
      isValid: res.isValid,
      byteLength: res.bytes.length,
      error: res.error,
    };
  }, [value, currentEncoding]);

  // Prettify JSON / Format handler
  const handlePrettify = useCallback(() => {
    if (!value) return;
    const res = tryFormatJson(value, 2);
    if (res.success) {
      onChange(res.formatted);
    }
  }, [value, onChange]);

  // Minify JSON handler
  const handleMinify = useCallback(() => {
    if (!value) return;
    const res = tryFormatJson(value, 0);
    if (res.success) {
      try {
        const compact = JSON.stringify(res.data);
        onChange(compact);
      } catch {
        onChange(res.formatted);
      }
    }
  }, [value, onChange]);

  // Tab key & Shift+Alt+F shortcut support
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
        handlePrettify();
      }
    },
    [value, onChange, handlePrettify]
  );

  // Apply template
  const handleApplyTemplate = useCallback(
    (template: PayloadTemplate) => {
      onChange(template.content);
      if (onEncodingChange && template.encoding !== currentEncoding) {
        onEncodingChange(template.encoding);
      }
      setTemplateMenuOpen(false);
    },
    [onChange, onEncodingChange, currentEncoding]
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

  const encodings: { id: EncodingType; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'json', label: 'JSON', icon: Braces },
    { id: 'cbor', label: 'CBOR', icon: Code },
    { id: 'text', label: 'Text', icon: FileText },
    { id: 'raw', label: 'RAW', icon: Binary },
  ];

  return (
    <div
      style={style}
      className={`flex flex-col rounded-md border bg-card text-card-foreground shadow-xs ${className}`}
    >
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-3 py-1.5 shrink-0">
        {/* Encoding Selector Pills */}
        {showEncodingSelector && onEncodingChange ? (
          <div className="flex items-center space-x-1">
            {encodings.map((enc) => {
              const Icon = enc.icon;
              const isActive = currentEncoding === enc.id;
              return (
                <button
                  key={enc.id}
                  onClick={() => onEncodingChange(enc.id)}
                  disabled={disabled}
                  type="button"
                  className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-background text-foreground shadow-xs'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  {enc.label}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase">
            <FileCode className="w-3 h-3" />
            {currentEncoding} Payload
          </div>
        )}

        {/* Action Buttons & Templates */}
        <div className="flex items-center gap-1.5">
          {/* Templates Dropdown */}
          {showTemplates && (
            <div className="relative">
              <button
                type="button"
                disabled={disabled}
                onClick={() => setTemplateMenuOpen(!templateMenuOpen)}
                className="inline-flex items-center gap-1 rounded border bg-background px-2 py-0.5 text-xs font-medium hover:bg-muted disabled:opacity-50 transition-colors"
                title="Insert snippet template"
              >
                <BookOpen className="w-3 h-3 text-muted-foreground" />
                <span>Templates</span>
                <ChevronDown className="w-3 h-3 text-muted-foreground" />
              </button>

              {templateMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setTemplateMenuOpen(false)}
                  />
                  <div className="absolute right-0 top-full z-50 mt-1 w-64 rounded-md border bg-popover p-1 shadow-md text-popover-foreground">
                    <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase">
                      Quick Templates
                    </div>
                    {PAYLOAD_TEMPLATES.map((tmpl) => (
                      <button
                        key={tmpl.name}
                        type="button"
                        onClick={() => handleApplyTemplate(tmpl)}
                        className="flex w-full flex-col items-start rounded px-2 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground transition-colors"
                      >
                        <div className="flex w-full items-center justify-between font-medium">
                          <span>{tmpl.name}</span>
                          <span className="text-[10px] uppercase text-muted-foreground rounded bg-muted px-1">
                            {tmpl.encoding}
                          </span>
                        </div>
                        <span className="text-[11px] text-muted-foreground line-clamp-1">
                          {tmpl.description}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Format / Prettify JSON Button (for json or cbor) */}
          {isJsonLike && (
            <>
              <button
                type="button"
                disabled={disabled || !value}
                onClick={handlePrettify}
                className="inline-flex items-center gap-1 rounded-md border bg-background px-2.5 py-0.5 text-xs font-medium hover:bg-muted hover:text-foreground text-foreground disabled:opacity-50 transition-colors shadow-xs"
                title="Format & Prettify JSON (Shift+Alt+F)"
              >
                <Sparkles className="w-3 h-3 text-sky-500" />
                <span>Format</span>
              </button>
              <button
                type="button"
                disabled={disabled || !value}
                onClick={handleMinify}
                className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-0.5 text-xs font-medium hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors shadow-xs"
                title="Minify JSON"
              >
                <Minimize2 className="w-3 h-3" />
                <span>Minify</span>
              </button>
            </>
          )}

          {/* Copy Button */}
          <button
            type="button"
            disabled={disabled || !value}
            onClick={handleCopy}
            className="inline-flex items-center gap-1 rounded border bg-background px-2 py-0.5 text-xs font-medium hover:bg-muted disabled:opacity-50 transition-colors"
            title="Copy payload text"
          >
            {copied ? (
              <Check className="w-3 h-3 text-emerald-500" />
            ) : (
              <Copy className="w-3 h-3 text-muted-foreground" />
            )}
          </button>

          {/* Clear Button */}
          <button
            type="button"
            disabled={disabled || !value}
            onClick={handleClear}
            className="inline-flex items-center gap-1 rounded border bg-background px-2 py-0.5 text-xs font-medium hover:bg-destructive/10 hover:text-destructive disabled:opacity-50 transition-colors"
            title="Clear editor"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Editor Body with Synchronized Syntax Highlighting */}
      <div className="relative flex-1 min-h-[100px] overflow-hidden bg-background">
        {/* Syntax-highlighted background layer for JSON & CBOR */}
        {isJsonLike && value ? (
          <pre
            ref={highlightRef}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 m-0 overflow-auto p-2.5 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all select-none text-foreground [tab-size:2]"
          >
            <JsonHighlightedCode code={value} />
            {value.endsWith('\n') ? ' ' : ''}
          </pre>
        ) : null}

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
          placeholder={
            placeholder ||
            (currentEncoding === 'json'
              ? '{\n  "key": "value"\n}'
              : currentEncoding === 'cbor'
              ? '{\n  "temp": 24.5\n}'
              : currentEncoding === 'raw'
              ? '0x48 0x65 0x6c 0x6c 0x6f'
              : 'Type payload message...')
          }
          disabled={disabled}
          rows={rows}
          className={`relative z-10 w-full h-full min-h-[100px] resize-y border-0 m-0 bg-transparent p-2.5 font-mono text-xs leading-relaxed placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 whitespace-pre-wrap break-all [tab-size:2] ${
            isJsonLike && value
              ? 'text-transparent caret-foreground selection:bg-sky-500/30 dark:selection:bg-sky-500/40'
              : 'text-foreground'
          }`}
          spellCheck={false}
        />
      </div>

      {/* Footer Status & Validation Bar */}
      <div className="flex flex-wrap items-center justify-between border-t bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground shrink-0">
        {/* Left: Validation Feedback */}
        <div className="flex items-center gap-1.5">
          {!value || value.trim().length === 0 ? (
            <span className="text-[11px] text-muted-foreground">Empty payload</span>
          ) : validation.isValid ? (
            <div className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>Valid {currentEncoding.toUpperCase()}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-[11px] text-destructive font-medium">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate max-w-[320px]">{validation.error || 'Syntax error'}</span>
            </div>
          )}
        </div>

        {/* Right: Encoded Byte Size */}
        <div className="flex items-center gap-2 font-mono text-[11px]">
          <span>Size:</span>
          <span className="font-semibold text-foreground">
            {formatByteSize(validation.byteLength)}
          </span>
          <span className="text-muted-foreground">
            ({validation.byteLength} {validation.byteLength === 1 ? 'byte' : 'bytes'})
          </span>
        </div>
      </div>
    </div>
  );
};

export default PayloadEditor;
