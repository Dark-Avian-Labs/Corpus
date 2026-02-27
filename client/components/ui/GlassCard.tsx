import type { HTMLAttributes } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function GlassCard({
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={twMerge(
        clsx(
          'rounded-2xl border border-[var(--color-glass-border)] bg-[var(--color-glass)] shadow-[var(--shadow-panel)] backdrop-blur',
          className,
        ),
      )}
      {...props}
    />
  );
}
