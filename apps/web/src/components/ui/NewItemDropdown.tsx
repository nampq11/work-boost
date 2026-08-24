import { FileText, Plus } from '@phosphor-icons/react';
import { Dropdown, DropdownItem } from '@work-boost/ui';
import React from 'react';
import { useI18n } from '../../lib/i18n.tsx';

export function NewItemDropdown({ onNewNote }: { onNewNote: () => void }) {
  const { t } = useI18n();
  return (
    <Dropdown
      className="flex-1"
      buttonClassName="w-full"
      menuClassName="left-0 right-0 min-w-0"
      trigger={
        <>
          <Plus size={13} />
          <span className="text-sm">{t('common.new')}</span>
        </>
      }
    >
      <DropdownItem onClick={onNewNote}>
        <FileText size={14} />
        <span>{t('editor.newNote')}</span>
      </DropdownItem>
    </Dropdown>
  );
}
