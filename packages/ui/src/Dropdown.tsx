import { Menu } from '@base-ui/react';
import { Plus } from '@phosphor-icons/react';
import React from 'react';
import { Button } from './Button.tsx';
import { cn } from './cn.ts';

const MENU_CLASSES =
  'min-w-[160px] bg-[var(--surface-app)] border border-[var(--border)] rounded-md shadow-lg z-50 py-1';
('min-w-[160px] bg-[var(--surface-app)] border border-[var(--border)] rounded-md shadow-lg z-50 py-1');

const ITEM_CLASSES =
  'w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--surface-hover)] data-[highlighted]:bg-[var(--surface-hover)] outline-none cursor-pointer';

interface DropdownProps {
  trigger?: React.ReactNode;
  children: React.ReactNode;
  /** Extra classes for the root wrapper */
  className?: string;
  /** Extra classes for the trigger button */
  buttonClassName?: string;
  /** Extra classes for the popup menu */
  menuClassName?: string;
}

export function Dropdown({
  trigger,
  children,
  className,
  buttonClassName,
  menuClassName,
}: DropdownProps) {
  return (
    <div className={className}>
      <Menu.Root>
        <Menu.Trigger
          render={<Button variant="outline" size="sm" className={cn('gap-1.5', buttonClassName)} />}
        >
          {trigger || (
            <>
              <Plus size={13} />
              <span className="text-sm">New</span>
            </>
          )}
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner align="start" sideOffset={4}>
            <Menu.Popup className={cn(MENU_CLASSES, menuClassName)}>{children}</Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </div>
  );
}

export function DropdownItem({ className, ...props }: React.ComponentProps<typeof Menu.Item>) {
  return <Menu.Item className={cn(ITEM_CLASSES, className)} {...props} />;
}
