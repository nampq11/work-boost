import { Coins, FileText, Plus } from '@phosphor-icons/react';
import React, { useRef, useEffect } from 'react';
import { Button } from './Button.tsx';

interface DropdownProps {
  trigger?: React.ReactNode;
  children: React.ReactNode;
}

export function Dropdown({ trigger, children }: DropdownProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <Button variant="outline" size="sm" onClick={() => setIsOpen(!isOpen)} className="gap-1.5">
        {trigger || (
          <>
            <Plus size={13} />
            <span className="text-sm">New</span>
          </>
        )}
      </Button>
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 min-w-[160px] bg-[var(--surface-app)] border border-[var(--border)] rounded-md shadow-lg z-50 py-1">
          {children}
        </div>
      )}
    </div>
  );
}

export function NewItemDropdown({
  onNewNote,
  onNewDebt,
}: { onNewNote: () => void; onNewDebt: () => void }) {
  const [isOpen, setIsOpen] = React.useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNewNote = () => {
    setIsOpen(false);
    onNewNote();
  };

  const handleNewDebt = () => {
    setIsOpen(false);
    onNewDebt();
  };

  return (
    <div className="relative flex-1" ref={dropdownRef}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full gap-1.5"
      >
        <Plus size={13} />
        <span className="text-sm">New</span>
      </Button>
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--surface-app)] border border-[var(--border)] rounded-md shadow-lg z-50 py-1">
          <button
            type="button"
            onClick={handleNewNote}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
          >
            <FileText size={14} />
            <span>New Note</span>
          </button>
          <button
            type="button"
            onClick={handleNewDebt}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
          >
            <Coins size={14} />
            <span>New Debt</span>
          </button>
        </div>
      )}
    </div>
  );
}
