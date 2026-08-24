import { cn } from '@work-boost/ui';
import type { ComponentProps } from 'react';
import React from 'react';

export type GenerationLoaderVariant = 'dots' | 'squares' | 'rounded';

export interface GenerationLoaderProps extends Omit<ComponentProps<'div'>, 'children'> {
  label: string;
  tick: number;
  variant?: GenerationLoaderVariant;
}

const cellShapes: Record<GenerationLoaderVariant, string> = {
  dots: 'rounded-full',
  squares: 'rounded-[1px]',
  rounded: 'rounded-[3px]',
};

export function GenerationLoader({
  label,
  tick,
  variant = 'dots',
  className,
  ...props
}: GenerationLoaderProps) {
  const pixelOffset = Math.floor(tick / 3);

  return (
    <div
      data-slot="generation-loader"
      role="status"
      aria-label={label}
      className={cn('flex flex-col items-center gap-3', className)}
      {...props}
    >
      <div aria-hidden="true" className="grid grid-cols-3 gap-1">
        {Array.from({ length: 9 }, (_, index) => {
          const active = (index * 2 + pixelOffset) % 9 < 3;

          return (
            <span
              key={index}
              className={cn(
                'size-2 bg-[var(--text-primary)] transition-opacity duration-300',
                'motion-reduce:transition-none',
                cellShapes[variant],
                active ? 'opacity-90' : 'opacity-15',
              )}
            />
          );
        })}
      </div>
      <span className="copilot-loading-label text-sm text-[var(--text-muted)]">{label}</span>
    </div>
  );
}
