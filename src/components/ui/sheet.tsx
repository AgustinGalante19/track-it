import * as SheetPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from './button';

// shadcn/ui Sheet composition, styled with the application's theme tokens.
export const Sheet = SheetPrimitive.Root;
export const SheetTrigger = SheetPrimitive.Trigger;
export const SheetClose = SheetPrimitive.Close;
export const SheetTitle = SheetPrimitive.Title;
export const SheetDescription = SheetPrimitive.Description;

export function SheetContent({ children, className, side = 'left', ...props }: React.ComponentProps<typeof SheetPrimitive.Content> & { side?: 'left' | 'right' }) {
  return <SheetPrimitive.Portal>
    <SheetPrimitive.Overlay className="sheet-overlay" />
    <SheetPrimitive.Content className={cn('sheet-content', `sheet-${side}`, className)} {...props}>
      {children}
      <SheetPrimitive.Close asChild>
        <Button variant="ghost" size="icon" className="sheet-close" aria-label="Cerrar menú"><X size={20} /></Button>
      </SheetPrimitive.Close>
    </SheetPrimitive.Content>
  </SheetPrimitive.Portal>;
}
