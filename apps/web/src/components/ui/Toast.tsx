import { X } from '@phosphor-icons/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../../lib/i18n.tsx';
import type { ToastData } from '../../store/ui-store.ts';
import { useUiStore } from '../../store/ui-store.ts';

// Auto-dismiss after this long. Toasts that carry an action (e.g. Undo) get a
// little longer so the user has a chance to act on them.
const DEFAULT_TOAST_DURATION = 4000;
const ACTION_TOAST_DURATION = 6000;
// Exit transition length; must match the CSS `toast-out` animation duration.
const EXIT_MS = 180;

interface ToastItemProps {
  toast: ToastData;
  onDismiss: (id: number) => void;
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const { t } = useI18n();
  const duration = toast.action ? ACTION_TOAST_DURATION : DEFAULT_TOAST_DURATION;
  const [leaving, setLeaving] = useState(false);
  const [paused, setPaused] = useState(false);
  // Two distinct timers so the countdown cleanup never cancels the removal
  // timeout that `beginExit` schedules when it fires.
  const countdown = useRef<number | null>(null);
  const removeTimer = useRef<number | null>(null);
  const startedAt = useRef(0);
  const remaining = useRef(duration);

  // Kick off the exit animation, then remove the toast once it finishes so the
  // store stays the single source of truth for "which toasts exist".
  const beginExit = useCallback(() => {
    if (removeTimer.current) return;
    setLeaving(true);
    removeTimer.current = window.setTimeout(() => onDismiss(toast.id), EXIT_MS);
  }, [onDismiss, toast.id]);

  // Count down unless we are already leaving or paused by a hover.
  useEffect(() => {
    if (leaving || paused) return;
    startedAt.current = Date.now();
    countdown.current = window.setTimeout(beginExit, remaining.current);
    return () => {
      if (countdown.current) {
        clearTimeout(countdown.current);
        countdown.current = null;
      }
    };
  }, [leaving, paused, beginExit]);

  // The removal timer is only ever cancelled on unmount; the countdown effect
  // must not touch it or the exit animation gets cut short.
  useEffect(() => {
    return () => {
      if (removeTimer.current) clearTimeout(removeTimer.current);
    };
  }, []);

  function handleMouseEnter(): void {
    if (leaving) return;
    setPaused(true);
    if (countdown.current) {
      remaining.current -= Date.now() - startedAt.current;
      clearTimeout(countdown.current);
      countdown.current = null;
    }
  }

  function handleMouseLeave(): void {
    if (leaving) return;
    setPaused(false);
  }

  function handleClose(): void {
    beginExit();
  }

  function handleAction(): void {
    toast.action?.run();
    beginExit();
  }

  return (
    <div
      className={`toast${leaving ? ' toast-leaving' : ''}`}
      role="status"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <span className="toast-message">{toast.message}</span>
      {toast.action && (
        <button type="button" className="toast-action" onClick={handleAction}>
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        className="toast-close"
        onClick={handleClose}
        aria-label={t('toast.dismiss')}
      >
        <X size={14} weight="bold" />
      </button>
    </div>
  );
}

export function Toast() {
  const toasts = useUiStore((state) => state.toasts);
  const dismissToast = useUiStore((state) => state.dismissToast);
  if (toasts.length === 0) return null;
  return (
    <div className="toast-viewport">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={dismissToast} />
      ))}
    </div>
  );
}
