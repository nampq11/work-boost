import { type VariantProps, cva } from 'class-variance-authority';
import React, { type ComponentProps } from 'react';
import { cn } from './cn.ts';

export const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-[var(--text-primary)] text-[var(--text-inverse)]',
        secondary: 'border-transparent bg-[var(--surface-hover)] text-[var(--text-secondary)]',
        outline: 'text-[var(--text-primary)] border-[var(--border)]',
        success: 'border-transparent bg-[var(--accent-green)]/15 text-[var(--accent-green)]',
        warning: 'border-transparent bg-[var(--accent-orange)]/15 text-[var(--accent-orange)]',
        error: 'border-transparent bg-[var(--accent-red)]/15 text-[var(--accent-red)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps extends ComponentProps<'span'>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
