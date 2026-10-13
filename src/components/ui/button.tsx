import { forwardRef } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '../../lib/utils';
type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'outline' | 'ghost' | 'danger'; size?: 'default' | 'sm' | 'icon'; asChild?: boolean };
export const Button = forwardRef<HTMLButtonElement, Props>(({ className, variant = 'primary', size = 'default', asChild = false, ...props }, ref) => {
  const Component = asChild ? Slot : 'button';
  return <Component ref={ref} className={cn('btn', `btn-${variant}`, `btn-${size}`, className)} {...props} />;
});
Button.displayName = 'Button';
