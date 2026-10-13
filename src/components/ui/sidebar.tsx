import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { PanelLeft } from 'lucide-react';
import { Button } from './button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from './sheet';

const MOBILE_QUERY = '(max-width: 720px)';
type SidebarContextValue = {
  open: boolean;
  isMobile: boolean;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  toggleSidebar: () => void;
  mobileTrigger: React.RefObject<HTMLButtonElement | null>;
};
const SidebarContext = createContext<SidebarContextValue | null>(null);

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) throw new Error('Falta SidebarProvider.');
  return context;
}

// The shadcn/ui Sidebar pattern: persistent desktop state and a modal Sheet on mobile.
export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(() => localStorage.getItem('sidebar-open') !== 'false');
  const [isMobile, setIsMobile] = useState(() => matchMedia(MOBILE_QUERY).matches);
  const [openMobile, setOpenMobile] = useState(false);
  const mobileTrigger = useRef<HTMLButtonElement>(null);

  useEffect(() => { localStorage.setItem('sidebar-open', String(open)); }, [open]);
  useEffect(() => {
    const query = matchMedia(MOBILE_QUERY);
    const update = () => { setIsMobile(query.matches); setOpenMobile(false); };
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  function toggleSidebar() {
    if (isMobile) setOpenMobile((value) => !value);
    else setOpen((value) => !value);
  }
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
      if (event.key.toLowerCase() === 'b' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [isMobile]);

  return <SidebarContext.Provider value={{ open, isMobile, openMobile, setOpenMobile, toggleSidebar, mobileTrigger }}>
    <div className="app-shell" data-sidebar-state={open ? 'expanded' : 'collapsed'}>{children}</div>
  </SidebarContext.Provider>;
}

export function Sidebar({ children }: { children: React.ReactNode }) {
  const { isMobile, openMobile, setOpenMobile, mobileTrigger } = useSidebar();
  if (isMobile) return <Sheet open={openMobile} onOpenChange={setOpenMobile}>
    <SheetContent id="app-navigation" className="sidebar-mobile" onCloseAutoFocus={(event) => {
      event.preventDefault();
      mobileTrigger.current?.focus();
    }}>
      <SheetTitle className="sr-only">Menú de navegación</SheetTitle>
      <SheetDescription className="sr-only">Accedé a tus movimientos y configuración.</SheetDescription>
      {children}
    </SheetContent>
  </Sheet>;
  return <aside id="app-navigation" className="sidebar" aria-label="Menú de navegación">{children}</aside>;
}

export function SidebarTrigger({ children }: { children?: React.ReactNode }) {
  const { open, isMobile, openMobile, toggleSidebar, mobileTrigger } = useSidebar();
  const label = isMobile ? 'Abrir menú' : open ? 'Contraer menú' : 'Expandir menú';
  return <Button ref={mobileTrigger} variant="ghost" size="icon" className="sidebar-trigger" aria-label={label}
    title={`${label} (Ctrl+B)`} aria-expanded={isMobile ? openMobile : open} aria-haspopup={isMobile ? 'dialog' : undefined}
    aria-controls="app-navigation" onClick={(event) => { mobileTrigger.current = event.currentTarget; toggleSidebar(); }}>
    {children ?? <PanelLeft size={19} />}
  </Button>;
}
