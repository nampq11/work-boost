import React from 'react';
import { useI18n } from '../../lib/i18n.tsx';
import { useUiStore } from '../../store/ui-store.ts';

export function Toast() {
  const { t } = useI18n();
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
      <button onClick={dismiss} aria-label={t('toast.dismiss')}>
        {t('toast.close')}
      </button>
    </div>
  );
}
