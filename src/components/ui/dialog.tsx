import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { Button } from './button';
export function Dialog({ title, description, open = true, onClose, children }: { title: string; description?: string; open?: boolean; onClose: () => void; children: React.ReactNode }) {
  return <DialogPrimitive.Root open={open} onOpenChange={(value) => { if (!value) onClose(); }}><DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="dialog-overlay" />
    <DialogPrimitive.Content className="dialog-content" aria-describedby={description ? undefined : undefined}>
      <div className="dialog-header"><div><DialogPrimitive.Title>{title}</DialogPrimitive.Title><DialogPrimitive.Description className={description ? 'muted small' : 'sr-only'}>{description || 'Completá los datos y guardá los cambios.'}</DialogPrimitive.Description></div>
        <DialogPrimitive.Close asChild><Button variant="ghost" size="icon" aria-label="Cerrar"><X size={19} /></Button></DialogPrimitive.Close></div>
      {children}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal></DialogPrimitive.Root>;
}
