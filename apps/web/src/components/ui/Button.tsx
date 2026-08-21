import React, { type ComponentProps } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '../../lib/utils.ts';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none',
  {
    variants: {
      variant: {
        default: 'bg-[var(--text-primary)] text-[var(--text-inverse)] hover:opacity-90 shadow-sm',
        destructive: 'bg-[var(--accent-red)] text-white hover:opacity-90',
        outline:
          'border border-[var(--border)] bg-[var(--surface-app)] hover:bg-[var(--surface-hover)]',
        secondary: 'bg-[var(--surface-hover)] text-[var(--text-primary)] hover:opacity-80',
        ghost:
          'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]',
        link: 'text-[var(--text-primary)] underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4',
        xs: 'h-7 px-3 text-xs',
        sm: 'h-8 px-3.5 text-sm',
        lg: 'h-10 px-5',
        icon: 'h-9 w-9 p-0',
        'icon-xs': 'h-7 w-7 p-0',
      },
    },
    defaultVariants: {
      variant: 'ghost',
      size: 'default',
    },
  },
);

export interface ButtonProps extends ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
