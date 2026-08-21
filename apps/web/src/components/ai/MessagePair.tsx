import type { ComponentProps, ReactNode } from 'react';
import React, { useEffect, useState } from 'react';
import { cn } from '../../lib/utils.ts';
import { GenerationLoader } from './LoadingState.tsx';
import { StreamingText } from './StreamingText.tsx';

export interface MessagePairProps extends Omit<ComponentProps<'div'>, 'children'> {
  userMessage: string;
  words: readonly string[];
  visibleWords: number;
  streaming: boolean;
  loading?: boolean;
  variant?: 'bubble' | 'flat';
  assistantContent?: ReactNode;
  actions?: ReactNode;
}

export function MessagePair({
  userMessage,
  words,
  visibleWords,
  streaming,
  loading = false,
  variant = 'bubble',
  assistantContent,
  actions,
  className,
  ...props
}: MessagePairProps) {
  const showAssistantContent = assistantContent !== undefined && visibleWords >= words.length;
  const [loadingTick, setLoadingTick] = useState(0);

  useEffect(() => {
    if (!loading) {
      setLoadingTick(0);
      return;
    }

    const intervalId = window.setInterval(() => {
      setLoadingTick((currentTick) => currentTick + 1);
    }, 120);

    return () => window.clearInterval(intervalId);
  }, [loading]);

  return (
    <div
      data-slot="message-pair"
      className={cn('flex w-full flex-col gap-5', className)}
      {...props}
    >
      {userMessage && (
        <p
          className={cn(
            'max-w-[85%] self-end text-sm',
            variant === 'bubble'
              ? 'rounded-2xl bg-[var(--accent-blue)] px-3.5 py-2 text-white'
              : 'text-end text-[var(--text-primary)]',
          )}
        >
          {userMessage}
        </p>
      )}
      <div className="group/message flex flex-col items-start">
        {loading ? (
          <GenerationLoader
            label="Thinking"
            tick={loadingTick}
            className="min-h-[4.25rem] px-2 py-2"
          />
        ) : showAssistantContent ? (
          assistantContent
        ) : (
          <StreamingText
            segments={[{ text: words.join(' ') }]}
            count={visibleWords}
            streaming={streaming}
            className="min-h-[4.25rem] max-w-[95%] text-[var(--text-primary)]"
          />
        )}
        {actions}
      </div>
    </div>
  );
}
