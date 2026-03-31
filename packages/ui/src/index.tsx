import { clsx } from 'clsx';
import type { HTMLAttributes, PropsWithChildren } from 'react';

export function SurfaceCard({
  children,
  className,
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLDivElement>>) {
  return (
    <div className={clsx('pc-surface-card', className)} {...props}>
      {children}
    </div>
  );
}

export function SectionHeader({
  title,
  subtitle,
  className,
}: {
  title: string;
  subtitle?: string;
  className?: string;
}) {
  return (
    <div className={clsx('pc-section-header', className)}>
      <div>
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
    </div>
  );
}

export function StatusPill({
  tone = 'neutral',
  children,
}: PropsWithChildren<{ tone?: 'neutral' | 'success' | 'warning' | 'danger' }>) {
  return <span className={`pc-status-pill pc-status-pill--${tone}`}>{children}</span>;
}
