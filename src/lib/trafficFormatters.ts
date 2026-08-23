/**
 * Formatting utilities for traffic telemetry, rates, and sizes.
 */

export function formatThroughput(bytesPerSec: number): string {
  if (!bytesPerSec || bytesPerSec <= 0) return '0 B/s';
  if (bytesPerSec < 1024) return `${Math.round(bytesPerSec)} B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(2)} KB/s`;
  return `${(bytesPerSec / (1024 * 1024)).toFixed(2)} MB/s`;
}

export function formatMessageRate(msgsPerSec: number): string {
  if (!msgsPerSec || msgsPerSec <= 0) return '0 msgs/s';
  if (msgsPerSec < 1000) return `${Math.round(msgsPerSec)} msgs/s`;
  return `${(msgsPerSec / 1000).toFixed(1)}k msgs/s`;
}

export function formatByteSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
