import { Coins, FileText, Plus } from '@phosphor-icons/react';
import { Dropdown, DropdownItem } from '@work-boost/ui';
import React from 'react';

export function NewItemDropdown({
  onNewNote,
  onNewDebt,
}: { onNewNote: () => void; onNewDebt: () => void }) {
  return (
    <Dropdown
      className="flex-1"
      buttonClassName="w-full"
      menuClassName="left-0 right-0 min-w-0"
      trigger={
        <>
          <Plus size={13} />
          <span className="text-sm">New</span>
        </>
      }
    >
      <DropdownItem onClick={onNewNote}>
        <FileText size={14} />
        <span>New Note</span>
      </DropdownItem>
      <DropdownItem onClick={onNewDebt}>
        <Coins size={14} />
        <span>New Debt</span>
      </DropdownItem>
    </Dropdown>
  );
}
