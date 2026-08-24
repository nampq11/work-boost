import { cn } from '@work-boost/ui';
import type { ComponentProps, ReactNode } from 'react';
import React, { useEffect, useState } from 'react';
import { useI18n } from '../../lib/i18n.tsx';
import { GenerationLoader } from './LoadingState.tsx';

export interface MessagePairProps extends Omit<ComponentProps<'div'>, 'children'> {
  userMessage: string;
  loading?: boolean;
  variant?: 'bubble' | 'flat';
  assistantContent?: ReactNode;
  actions?: ReactNode;
}

export function MessagePair({
  userMessage,
  loading = false,
  variant = 'bubble',
  assistantContent,
  actions,
  className,
  ...props
}: MessagePairProps) {
  const { t } = useI18n();
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
      <div className="group/message relative flex flex-col items-start">
        {loading ? (
          <GenerationLoader
            label={t('messagePair.thinking')}
            tick={loadingTick}
            className="min-h-[4.25rem] px-2 py-2"
          />
        ) : (
          assistantContent
        )}
        {actions}
      </div>
    </div>
  );
}
