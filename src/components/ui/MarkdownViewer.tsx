import React, { useState } from 'react';
import {
  Copy,
  Check,
  ExternalLink,
  CheckSquare,
  Square,
  Sparkles,
  Terminal,
} from 'lucide-react';
import {
  parseMarkdown,
  type BlockNode,
  type InlineToken,
  type BadgeVariant,
} from '../../lib/markdown';
import { Badge } from './badge';
import { open as openUrl } from '@tauri-apps/plugin-shell';

export interface MarkdownViewerProps {
  content?: string | null;
  className?: string;
  maxHeight?: string;
}

export const MarkdownViewer: React.FC<MarkdownViewerProps> = ({
  content,
  className = '',
  maxHeight = 'max-h-64',
}) => {
  if (!content || !content.trim()) {
    return (
      <div className={`p-3 rounded-lg bg-muted/20 border text-xs text-muted-foreground italic ${className}`}>
        No changelog notes provided.
      </div>
    );
  }

  const nodes = parseMarkdown(content);

  const handleOpenLink = async (e: React.MouseEvent, href: string) => {
    e.preventDefault();
    try {
      if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
        await openUrl(href);
      } else {
        window.open(href, '_blank', 'noopener,noreferrer');
      }
    } catch {
      window.open(href, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className={`overflow-y-auto space-y-2 rounded-lg bg-card/60 p-3.5 border text-xs leading-relaxed ${maxHeight} ${className}`}>
      {nodes.map((node, index) => (
        <BlockRenderer key={index} node={node} onOpenLink={handleOpenLink} />
      ))}
    </div>
  );
};

interface BlockRendererProps {
  node: BlockNode;
  onOpenLink: (e: React.MouseEvent, href: string) => void;
}

const BlockRenderer: React.FC<BlockRendererProps> = ({ node, onOpenLink }) => {
  switch (node.type) {
    case 'heading': {
      if (node.level === 1) {
        return (
          <h1 className="text-sm font-bold text-foreground mt-3 mb-1.5 pb-1 border-b border-border/60 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-emerald-500 shrink-0" />
            <span><InlineList inlines={node.inlines} onOpenLink={onOpenLink} /></span>
          </h1>
        );
      }
      if (node.level === 2) {
        return (
          <h2 className="text-xs font-semibold text-foreground mt-2.5 mb-1 pb-0.5 border-b border-border/30">
            <InlineList inlines={node.inlines} onOpenLink={onOpenLink} />
          </h2>
        );
      }
      if (node.level === 3) {
        return (
          <h3 className="text-xs font-semibold text-foreground mt-2 mb-0.5">
            <InlineList inlines={node.inlines} onOpenLink={onOpenLink} />
          </h3>
        );
      }
      return (
        <h4 className="text-[11px] font-medium text-foreground mt-1.5 mb-0.5">
          <InlineList inlines={node.inlines} onOpenLink={onOpenLink} />
        </h4>
      );
    }

    case 'paragraph':
      return (
        <p className="text-xs text-muted-foreground leading-relaxed my-1">
          <InlineList inlines={node.inlines} onOpenLink={onOpenLink} />
        </p>
      );

    case 'list': {
      if (node.ordered) {
        return (
          <ol className="list-decimal list-outside pl-4 space-y-1 my-1.5 text-xs text-muted-foreground">
            {node.items.map((item, idx) => (
              <li key={idx} className="pl-0.5">
                <InlineList inlines={item.inlines} onOpenLink={onOpenLink} />
              </li>
            ))}
          </ol>
        );
      }

      return (
        <ul className="space-y-1 my-1.5 text-xs text-muted-foreground">
          {node.items.map((item, idx) => (
            <li key={idx} className="flex items-start gap-1.5 pl-0.5">
              {item.checked !== undefined ? (
                item.checked ? (
                  <CheckSquare className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                ) : (
                  <Square className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                )
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 mt-1.5 shrink-0" />
              )}
              <span className="flex-1">
                <InlineList inlines={item.inlines} onOpenLink={onOpenLink} />
              </span>
            </li>
          ))}
        </ul>
      );
    }

    case 'code_block':
      return <CodeBlock code={node.code} language={node.language} />;

    case 'blockquote':
      return (
        <blockquote className="border-l-2 border-primary/60 bg-muted/30 px-3 py-1.5 rounded-r my-2 text-xs text-muted-foreground italic">
          <InlineList inlines={node.inlines} onOpenLink={onOpenLink} />
        </blockquote>
      );

    case 'thematic_break':
      return <hr className="my-2.5 border-border/50" />;

    case 'table':
      return (
        <div className="overflow-x-auto my-2 rounded-md border">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-muted/50 border-b">
                {node.headers.map((h, idx) => (
                  <th key={idx} className="p-2 font-semibold text-foreground">
                    <InlineList inlines={h} onOpenLink={onOpenLink} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {node.rows.map((row, rIdx) => (
                <tr key={rIdx} className="border-b last:border-0 hover:bg-muted/30">
                  {row.map((cell, cIdx) => (
                    <td key={cIdx} className="p-2 text-muted-foreground">
                      <InlineList inlines={cell} onOpenLink={onOpenLink} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    default:
      return null;
  }
};

const CodeBlock: React.FC<{ code: string; language?: string }> = ({ code, language }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative my-2 rounded-md border bg-muted/40 font-mono text-[11px] overflow-hidden group">
      <div className="flex items-center justify-between px-3 py-1 bg-muted/60 border-b text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Terminal className="w-3 h-3 text-muted-foreground" />
          <span>{language || 'text'}</span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 hover:text-foreground p-0.5 rounded transition-colors"
          title="Copy code snippet"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-500" />
              <span className="text-emerald-500 font-sans text-[10px]">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span className="font-sans text-[10px]">Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto text-foreground/90 whitespace-pre">
        <code>{code}</code>
      </pre>
    </div>
  );
};

interface InlineListProps {
  inlines: InlineToken[];
  onOpenLink: (e: React.MouseEvent, href: string) => void;
}

const InlineList: React.FC<InlineListProps> = ({ inlines, onOpenLink }) => {
  return (
    <>
      {inlines.map((token, idx) => {
        switch (token.type) {
          case 'text':
            return <React.Fragment key={idx}>{token.value}</React.Fragment>;

          case 'bold':
            return (
              <strong key={idx} className="font-semibold text-foreground">
                {token.value}
              </strong>
            );

          case 'italic':
            return (
              <em key={idx} className="italic text-foreground/90">
                {token.value}
              </em>
            );

          case 'strikethrough':
            return (
              <del key={idx} className="line-through opacity-70">
                {token.value}
              </del>
            );

          case 'code':
            return (
              <code
                key={idx}
                className="px-1.5 py-0.5 rounded bg-muted text-foreground font-mono text-[11px] border border-border/50"
              >
                {token.value}
              </code>
            );

          case 'link':
            return (
              <a
                key={idx}
                href={token.href}
                onClick={(e) => onOpenLink(e, token.href)}
                className="text-primary hover:underline font-medium inline-flex items-center gap-0.5 cursor-pointer"
                title={token.href}
              >
                <span>{token.text}</span>
                <ExternalLink className="w-2.5 h-2.5 inline shrink-0 opacity-70" />
              </a>
            );

          case 'badge':
            return <BadgeToken key={idx} variant={token.variant} label={token.label} />;

          default:
            return null;
        }
      })}
    </>
  );
};

const BadgeToken: React.FC<{ variant: BadgeVariant; label: string }> = ({ variant, label }) => {
  const badgeClasses: Record<BadgeVariant, string> = {
    breaking: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
    feat: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    fix: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
    perf: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
    docs: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    security: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
    refactor: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
    chore: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20',
    default: 'bg-muted text-muted-foreground border-border/50',
  };

  return (
    <Badge
      variant="outline"
      className={`text-[9px] font-mono px-1.5 py-0 uppercase mr-1 inline-block ${badgeClasses[variant] || badgeClasses.default}`}
    >
      {label}
    </Badge>
  );
};
