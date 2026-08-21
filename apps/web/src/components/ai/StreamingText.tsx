import React, { type ComponentProps, useMemo } from 'react';
import { cn } from '../../lib/utils.ts';

export interface StreamingTextSegment {
  text: string;
  mono?: boolean;
}

interface StreamingTextProps extends Omit<ComponentProps<'p'>, 'children'> {
  segments: StreamingTextSegment[];
  count: number;
  streaming: boolean;
}

export function StreamingText({
  segments,
  count,
  streaming,
  className,
  ...props
}: StreamingTextProps) {
  const words = useMemo(
    () =>
      segments.flatMap((segment) =>
        segment.text.split(' ').map((word) => ({
          word,
          mono: segment.mono ?? false,
        })),
      ),
    [segments],
  );
  const shown = words.slice(0, Math.max(0, Math.min(count, words.length)));

  return (
    <p
      data-slot="streaming-text"
      className={cn('max-w-sm text-sm leading-relaxed text-pretty', className)}
      {...props}
    >
      {shown.map(({ word, mono }, index) => {
        const fresh = streaming && shown.length - 1 - index < 2;
        return (
          <span key={`${index}-${word}`} className="copilot-streaming-word">
            <span
              className={cn(
                'transition-colors duration-700 motion-reduce:transition-none',
                fresh && 'text-blue-500 dark:text-blue-400',
                mono && 'rounded-md bg-foreground/[0.06] px-1.5 py-0.5 font-mono text-[0.85em]',
              )}
            >
              {word}
            </span>{' '}
          </span>
        );
      })}
      {streaming && shown.length > 0 && (
        <span
          aria-hidden
          className="-mb-0.5 ml-0.5 inline-block h-4 w-0.5 animate-pulse rounded-full bg-blue-500 dark:bg-blue-400"
        />
      )}
    </p>
  );
}
