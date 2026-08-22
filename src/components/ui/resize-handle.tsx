import React from 'react';
import { cn } from '../../lib/utils';

export interface ResizeHandleProps extends React.HTMLAttributes<HTMLDivElement> {
  direction?: 'horizontal' | 'vertical';
  isDragging?: boolean;
  onReset?: () => void;
}

export const ResizeHandle: React.FC<ResizeHandleProps> = ({
  direction = 'horizontal',
  isDragging = false,
  onReset,
  className,
  onKeyDown,
  ...props
}) => {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Home') {
      e.preventDefault();
      onReset?.();
    }
    onKeyDown?.(e);
  };

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation={direction === 'horizontal' ? 'vertical' : 'horizontal'}
      onDoubleClick={onReset}
      onKeyDown={handleKeyDown}
      className={cn(
        'group relative flex items-center justify-center shrink-0 z-10 transition-colors select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary',
        direction === 'horizontal'
          ? 'w-1.5 cursor-col-resize h-full bg-border/40 hover:bg-primary/40'
          : 'h-1.5 cursor-row-resize w-full bg-border/40 hover:bg-primary/40',
        isDragging && 'bg-primary! w-1.5',
        className
      )}
      title="Drag to resize panel (Double click or press Enter to reset)"
      {...props}
    >
      <div
        className={cn(
          'rounded-full bg-muted-foreground/30 group-hover:bg-primary transition-colors',
          direction === 'horizontal' ? 'h-6 w-0.5' : 'w-6 h-0.5',
          isDragging && 'bg-primary'
        )}
      />
    </div>
  );
};

export default ResizeHandle;
