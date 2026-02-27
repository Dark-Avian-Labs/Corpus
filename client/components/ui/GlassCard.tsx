import type { HTMLAttributes } from 'react';

export function GlassCard({
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-2xl border border-[var(--color-glass-border)] bg-[var(--color-glass)] shadow-[var(--shadow-panel)] backdrop-blur ${className}`}
      {...props}
    />
  );
}
