import React, { useState } from 'react';
import {
  Check,
  Copy,
  Globe,
  Lock,
  Network,
  Radio,
  Terminal,
  Zap,
} from 'lucide-react';
import { getLocatorProtocol } from '../../lib/tls';

export interface BoundLocatorBadgeProps {
  locator: string;
  isAutoPort?: boolean;
  size?: 'xs' | 'sm';
  showProtocolIcon?: boolean;
  className?: string;
  onCopy?: (locator: string) => void;
}

export const getProtocolIcon = (proto: string, iconClass = 'w-3 h-3') => {
  switch (proto.toLowerCase()) {
    case 'tls':
      return <Lock className={`${iconClass} text-emerald-500 shrink-0`} />;
    case 'wss':
      return <Lock className={`${iconClass} text-cyan-500 shrink-0`} />;
    case 'ws':
      return <Globe className={`${iconClass} text-indigo-500 shrink-0`} />;
    case 'quic':
      return <Zap className={`${iconClass} text-amber-500 shrink-0`} />;
    case 'udp':
      return <Radio className={`${iconClass} text-purple-500 shrink-0`} />;
    case 'unix':
    case 'unixpipe':
      return <Terminal className={`${iconClass} text-zinc-500 shrink-0`} />;
    case 'tcp':
    default:
      return <Network className={`${iconClass} text-sky-500 shrink-0`} />;
  }
};

export const BoundLocatorBadge: React.FC<BoundLocatorBadgeProps> = ({
  locator,
  isAutoPort = false,
  size = 'xs',
  showProtocolIcon = true,
  className = '',
  onCopy,
}) => {
  const [copied, setCopied] = useState(false);
  const proto = getLocatorProtocol(locator) || 'tcp';

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(locator);
    }
    setCopied(true);
    if (onCopy) {
      onCopy(locator);
    }
    setTimeout(() => {
      setCopied(false);
    }, 2000);
  };

  const isXs = size === 'xs';
  const iconSizeClass = isXs ? 'w-2.5 h-2.5' : 'w-3 h-3';

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={
        copied
          ? `Copied "${locator}" to clipboard!`
          : `Click to copy bound locator: ${locator}${
              isAutoPort ? ' (Dynamic ephemeral port assigned by OS)' : ''
            }`
      }
      className={`group inline-flex items-center rounded border font-mono transition-all select-none cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-ring ${
        isXs
          ? 'h-4.5 px-1.5 py-0 gap-1 text-[9px] bg-muted/50 hover:bg-muted border-border/60 hover:border-border text-foreground'
          : 'h-6 px-2 py-0.5 gap-1.5 text-xs bg-muted/60 hover:bg-muted border-border hover:border-foreground/30 text-foreground shadow-2xs'
      } ${
        copied
          ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
          : ''
      } ${className}`}
    >
      {/* Protocol Icon or Success Checkmark */}
      {copied ? (
        <Check className={`${iconSizeClass} text-emerald-500 shrink-0 animate-in fade-in zoom-in-75`} />
      ) : (
        showProtocolIcon && getProtocolIcon(proto, iconSizeClass)
      )}

      {/* Locator Text */}
      <span className="truncate max-w-[200px] font-medium tracking-tight">
        {locator}
      </span>

      {/* Auto Port Ephemeral Badge */}
      {isAutoPort && (
        <span
          className={`inline-flex items-center rounded font-sans font-semibold shrink-0 uppercase tracking-wider bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 ${
            isXs ? 'text-[8px] px-1 py-0' : 'text-[9px] px-1.5 py-0.5'
          }`}
          title="Dynamic ephemeral port dynamically bound by OS"
        >
          Auto Port
        </span>
      )}

      {/* Trailing Copy Indicator */}
      {copied ? (
        <span
          className={`font-sans font-semibold text-emerald-600 dark:text-emerald-400 shrink-0 ${
            isXs ? 'text-[8px]' : 'text-[10px]'
          }`}
        >
          Copied!
        </span>
      ) : (
        <Copy
          className={`${
            isXs ? 'w-2 h-2' : 'w-2.5 h-2.5'
          } text-muted-foreground/50 group-hover:text-foreground shrink-0 transition-colors`}
        />
      )}
    </button>
  );
};

export default BoundLocatorBadge;
