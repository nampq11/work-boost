import { GearSix } from '@phosphor-icons/react';
import { Menu, Switch } from '@base-ui/react';
import React from 'react';
import { useI18n } from '../../lib/i18n.tsx';
import { useUiStore } from '../../store/ui-store.ts';
import { Button } from '@work-boost/ui';

const MENU_CLASSES =
  'min-w-[220px] bg-[var(--surface-app)] border border-[var(--border)] rounded-md shadow-lg z-50 py-1';

export function SettingsMenu() {
  const { t } = useI18n();
  const isAutosaveEnabled = useUiStore((state) => state.isAutosaveEnabled);
  const setAutosaveEnabled = useUiStore((state) => state.setAutosaveEnabled);

  return (
    <Menu.Root>
      <Menu.Trigger
        render={<Button variant="ghost" size="icon" aria-label={t('settings.title')} />}
      >
        <GearSix size={15} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner align="end" sideOffset={4}>
          <Menu.Popup className={MENU_CLASSES}>
            <div className="flex items-center justify-between gap-4 px-3 py-2">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm text-[var(--text-primary)]">{t('settings.autosave')}</span>
                <span className="text-xs text-[var(--text-muted)]">
                  {t('settings.autosaveHint')}
                </span>
              </div>
              <Switch.Root
                checked={isAutosaveEnabled}
                onCheckedChange={setAutosaveEnabled}
                aria-label={t('settings.autosave')}
                className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-[var(--border)] bg-[var(--surface-hover)] transition-colors data-[checked]:bg-[var(--accent-blue)]"
              >
                <Switch.Thumb className="absolute left-0.5 h-4 w-4 rounded-full bg-[var(--text-inverse)] shadow-sm transition-transform data-[checked]:translate-x-4" />
              </Switch.Root>
            </div>
            <div className="px-3 py-2 text-xs text-[var(--text-muted)]">
              {t('settings.saveShortcut')}
            </div>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
