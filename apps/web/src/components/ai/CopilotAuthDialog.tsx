import { Dialog } from '@base-ui/react';
import { X } from '@phosphor-icons/react';
import { Button } from '@work-boost/ui';
import React from 'react';
import { useI18n } from '../../lib/i18n.tsx';
import { CopilotAuthPanel, type CopilotAuthPanelProps } from './CopilotAuthPanel.tsx';

export interface CopilotAuthDialogProps extends CopilotAuthPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CopilotAuthDialog({ open, onOpenChange, ...auth }: CopilotAuthDialogProps) {
  const { t } = useI18n();

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange} modal>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-black/50 data-[closed]:opacity-0 data-[open]:opacity-100 transition-opacity" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-[var(--border)] bg-[var(--surface-app)] shadow-lg data-[closed]:opacity-0 data-[open]:opacity-100 transition-opacity">
          <Dialog.Title className="sr-only">{t('copilot.auth.connection')}</Dialog.Title>
          <Dialog.Description className="sr-only">
            {t('copilot.auth.connectionHint')}
          </Dialog.Description>
          <Dialog.Close
            render={
              <Button variant="ghost" size="icon" className="absolute right-3 top-3">
                <X size={15} />
              </Button>
            }
          />

          <div className="max-h-[70vh] overflow-y-auto">
            <CopilotAuthPanel {...auth} />
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
