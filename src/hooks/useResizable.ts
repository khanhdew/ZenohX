import { useState, useCallback, useRef, useEffect } from 'react';

export interface UseResizableOptions {
  initialSize: number;
  minSize?: number;
  maxSize?: number;
  direction?: 'horizontal' | 'vertical';
  reverse?: boolean; // If resizing from right or bottom
  storageKey?: string;
  onResize?: (size: number) => void;
}

export function useResizable({
  initialSize,
  minSize = 100,
  maxSize = 1000,
  direction = 'horizontal',
  reverse = false,
  storageKey,
  onResize,
}: UseResizableOptions) {
  const [size, setSize] = useState<number>(() => {
    if (storageKey && typeof localStorage !== 'undefined') {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          const num = Number(saved);
          if (!isNaN(num) && num >= minSize && num <= maxSize) {
            return num;
          }
        }
      } catch {
        // Ignore localStorage read errors
      }
    }
    return initialSize;
  });

  const [isDragging, setIsDragging] = useState(false);
  const startPosRef = useRef(0);
  const startSizeRef = useRef(size);
  const latestSizeRef = useRef(size);

  latestSizeRef.current = size;

  const startDragging = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
      startPosRef.current = direction === 'horizontal' ? e.clientX : e.clientY;
      startSizeRef.current = latestSizeRef.current;
      document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';
    },
    [direction]
  );

  const resetToDefault = useCallback(() => {
    setSize(initialSize);
    latestSizeRef.current = initialSize;
    if (storageKey && typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(storageKey);
      } catch {}
    }
    onResize?.(initialSize);
  }, [initialSize, storageKey, onResize]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const currentPos = direction === 'horizontal' ? e.clientX : e.clientY;
      const delta = currentPos - startPosRef.current;
      const newSize = reverse
        ? startSizeRef.current - delta
        : startSizeRef.current + delta;

      const clamped = Math.max(minSize, Math.min(maxSize, newSize));
      setSize(clamped);
      latestSizeRef.current = clamped;
      onResize?.(clamped);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (storageKey && typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem(storageKey, String(latestSizeRef.current));
        } catch {}
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, direction, reverse, minSize, maxSize, storageKey, onResize]);

  return {
    size,
    isDragging,
    startDragging,
    resetToDefault,
    setSize,
  };
}
