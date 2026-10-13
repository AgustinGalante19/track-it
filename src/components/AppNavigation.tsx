import { useEffect, useState } from "react"
import { Link, NavLink, useLocation } from "react-router-dom"
import {
  ChevronRight,
  LogOut,
  Repeat2,
  Settings,
  ShoppingBag,
  Tags,
  Wallet,
} from "lucide-react"
import { useFinance } from "../context"
import { Button } from "./ui/button"
import { Sidebar, SidebarTrigger, useSidebar } from "./ui/sidebar"

const navigationItems = [
  { to: "/", label: "Gastos", Icon: ShoppingBag },
  { to: "/recurrentes", label: "Recurrentes", Icon: Repeat2 },
  { to: "/categorias", label: "Categorías", Icon: Tags },
  { to: "/cuentas", label: "Cuentas", Icon: Wallet },
]

export function AppSidebar() {
  const { month, user, signOut, notify } = useFinance()
  const { isMobile, setOpenMobile } = useSidebar()
  const location = useLocation()
  const closeMenu = () => setOpenMobile(false)

  useEffect(() => {
    setOpenMobile(false)
  }, [location.pathname, location.search, setOpenMobile])

  return (
    <Sidebar>
      <div className='sidebar-header'>
        <Link
          to={`/?mes=${month}`}
          className='brand'
          aria-label='Track-It, inicio'
          onClick={closeMenu}
          title='Track-It'
        >
          <span className='brand-mark'>
            <img src='/icon-192.png' width='37' height='37' alt='' />
          </span>
          <span className='sidebar-label'>Track-It</span>
        </Link>
      </div>
      <div className='sidebar-content'>
        <nav aria-label='Secciones principales' className='sidebar-group'>
          <p className='sidebar-group-label'>Tu actividad</p>
          {navigationItems.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={`${to}?mes=${month}`}
              end={to === "/"}
              className='sidebar-link'
              title={label}
              onClick={closeMenu}
            >
              <Icon size={19} aria-hidden='true' />
              <span className='sidebar-label'>{label}</span>
            </NavLink>
          ))}
        </nav>
        <p className='sidebar-note'>
          Tu mes, con claridad.
          <br />
          Una compra a la vez.
        </p>
      </div>
      <div className='sidebar-footer'>
        <NavLink
          to={`/ajustes?mes=${month}`}
          className='sidebar-link'
          title='Configuración'
          onClick={closeMenu}
        >
          <Settings size={19} aria-hidden='true' />
          <span className='sidebar-label'>Configuración</span>
        </NavLink>
        <div className='profile'>
          <span className='avatar' title={user.name}>
            {user.name.slice(0, 1).toUpperCase()}
          </span>
          <div className='sidebar-label'>
            <strong>{user.name}</strong>
            <span>Espacio personal</span>
          </div>
          <Button
            variant='ghost'
            size='icon'
            aria-label='Cerrar sesión'
            title='Cerrar sesión'
            onClick={() => {
              void signOut()
                .then(closeMenu)
                .catch((error: Error) => notify(error.message))
            }}
          >
            <LogOut size={17} />
          </Button>
        </div>
        {isMobile && (
          <p className='sidebar-mobile-hint'>Todo tu mes, en un solo lugar.</p>
        )}
      </div>
    </Sidebar>
  )
}

export function NavigationBreadcrumb() {
  const { data, month } = useFinance()
  const { pathname } = useLocation()
  const account = data.accounts.find(
    (item) => pathname === `/cuentas/${item.id}`,
  )
  const label =
    account?.name ??
    navigationItems.find((item) => item.to === pathname)?.label ??
    "Configuración"
  return (
    <nav className='navigation-breadcrumb' aria-label='Ubicación actual'>
      <Link to={`/?mes=${month}`} className='breadcrumb-home'>
        Mi espacio
      </Link>
      <ChevronRight size={14} className='breadcrumb-home' aria-hidden='true' />
      <span aria-current='page' title={label}>
        {label}
      </span>
    </nav>
  )
}

export function AccountMenuTrigger() {
  const { user } = useFinance()
  const [failedImage, setFailedImage] = useState<string | null>(null)

  return (
    <SidebarTrigger>
      <span className='avatar' aria-hidden='true'>
        {user.image && user.image !== failedImage ? (
          <img
            src={user.image}
            alt=''
            referrerPolicy='no-referrer'
            onError={() => setFailedImage(user.image ?? null)}
          />
        ) : (
          user.name.slice(0, 1).toUpperCase()
        )}
      </span>
    </SidebarTrigger>
  )
}

export function MobileNavigation() {
  const { month } = useFinance()
  return (
    <nav className='mobile-nav' aria-label='Navegación móvil'>
      {navigationItems.map(({ to, label, Icon }) => (
        <NavLink key={to} to={`${to}?mes=${month}`} end={to === "/"}>
          <Icon size={20} aria-hidden='true' />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
