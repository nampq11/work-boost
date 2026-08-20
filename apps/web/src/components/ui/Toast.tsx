import React from 'react';
import { useUiStore } from '../../store/ui-store.ts';

export function Toast() {
  const toast = useUiStore((state) => state.toast);
  const dismiss = useUiStore((state) => state.dismissToast);
  if (!toast) return null;
  return (
    <div className="toast" role="status">
      <span>{toast.message}</span>
      {toast.action && (
        <button
          onClick={() => {
            toast.action?.run();
            dismiss();
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button onClick={dismiss} aria-label="Dismiss">
        Close
      </button>
    </div>
  );
}
