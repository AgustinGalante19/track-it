import { lazy, Suspense, useCallback, useEffect, useState } from "react"
import {
  Link,
  Outlet,
  useLoaderData,
  useLocation,
  useNavigate,
  useNavigation,
  useRevalidator,
  useSearchParams,
} from "react-router-dom"
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Moon,
  RefreshCw,
  Sun,
  X,
  CheckCircle2,
  WifiOff,
} from "lucide-react"
import { FinanceContext, type Composer, type Confirmation } from "./context"
import type { Currency, Snapshot } from "../shared/domain"
import type { AuthUser } from "../shared/auth"
import { addMonth, formatMoney, today } from "../shared/format"
import { Button } from "./components/ui/button"
import { Dialog } from "./components/ui/dialog"
import { useAutoRefresh } from "./lib/use-auto-refresh"
import {
  AppSidebar,
  AccountMenuTrigger,
  MobileNavigation,
  NavigationBreadcrumb,
} from "./components/AppNavigation"
import { SidebarProvider } from "./components/ui/sidebar"

const ComposerDialog = lazy(() =>
  import("./forms").then((module) => ({ default: module.ComposerDialog })),
)

export function Loading() {
  return (
    <div className='loading-page' role='status' aria-live='polite'>
      <span className='brand-mark'>
        <img src='/icon-192.png' width='37' height='37' alt='Track-It' />
      </span>
      <span className='loading-spinner' aria-hidden='true' />
      <p>Ordenando tu mes…</p>
    </div>
  )
}
export function Layout() {
  const { data, user, loadedAt } = useLoaderData() as { data: Snapshot; user: AuthUser; loadedAt: number }
  const [params, setParams] = useSearchParams()
  const month = params.get("mes") || today().slice(0, 7)
  const [currency, setCurrencyState] = useState<Currency>(() =>
    localStorage.getItem("currency") === "USD" ? "USD" : "ARS",
  )
  const [theme, setTheme] = useState(
    () => localStorage.getItem("theme") || "system",
  )
  const [composer, setComposer] = useState<Composer | null>(null),
    [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [notice, setNotice] = useState(""),
    [confirmError, setConfirmError] = useState(""),
    [busy, setBusy] = useState(false),
    [online, setOnline] = useState(navigator.onLine)
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const navigation = useNavigation()
  const revalidator = useRevalidator()
  const refresh = useCallback(() => {
    void revalidator.revalidate()
  }, [revalidator.revalidate])
  const navigating = navigation.state !== "idle"
  const refreshing = revalidator.state !== "idle"
  useAutoRefresh({
    loadedAt,
    blocked: !!composer || !!confirmation || busy || navigating || refreshing,
    refresh,
    setOnline,
  })
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(""), 6000)
    return () => clearTimeout(timer)
  }, [notice])
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem("theme", theme)
  }, [theme])
  function setCurrency(value: Currency) {
    setCurrencyState(value)
    localStorage.setItem("currency", value)
  }
  async function signOut() {
    const { authClient } = await import("./lib/auth-client")
    const result = await authClient.signOut()
    if (result.error)
      throw new Error("No pudimos cerrar la sesión. Volvé a intentarlo.")
    setComposer(null)
    navigate("/acceso", { replace: true })
  }
  function setMonth(value: string) {
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) setParams({ mes: value })
  }
  const monthLabel = new Intl.DateTimeFormat("es-AR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-15T12:00:00Z`))
  const actual = data.movements.filter(
    (m) => !m.voided && m.currency === currency && m.date.startsWith(month),
  )
  const total = actual.reduce((sum, m) => sum + m.expenseAmount, 0)
  const accountById = new Map(data.accounts.map((a) => [a.id, a]))
  const pending = [
    ...data.occurrences
      .filter(
        (p) =>
          p.status === "pending" &&
          p.period === month &&
          accountById.get(p.accountId)?.currency === currency,
      )
      .map((p) => p.amount),
    ...data.installments
      .filter(
        (i) =>
          i.status === "pending" &&
          i.dueDate.startsWith(month) &&
          accountById.get(
            data.plans.find((p) => p.id === i.planId)?.accountId || "",
          )?.currency === currency,
      )
      .map((i) => i.amount),
  ]
  const isMain = ["/", "/recurrentes"].includes(pathname)
  return (
    <FinanceContext.Provider
      value={{
        data,
        month,
        currency,
        setCurrency,
        open: setComposer,
        confirm: (value) => {
          setConfirmError("")
          setConfirmation(value)
        },
        notify: setNotice,
        refresh,
        user,
        theme,
        setTheme,
        signOut,
      }}
    >
      <SidebarProvider>
        <a className='skip-link' href='#main-content'>
          Ir al contenido
        </a>
        <AppSidebar />
        <main id='main-content' className='app-main' tabIndex={-1}>
          {(navigating || refreshing) && (
            <div className='navigation-progress' role='status' aria-live='polite'>
              <span className='navigation-progress-bar' aria-hidden='true' />
              <span className='navigation-progress-label'>
                <span className='loading-spinner' aria-hidden='true' />
                {navigating ? "Cargando vista…" : "Actualizando datos…"}
              </span>
            </div>
          )}
          <header className='topbar'>
            <div className='topbar-navigation'>
              <AccountMenuTrigger />
              <NavigationBreadcrumb />
            </div>
            <div className='summary-controls'>
              <div className='month-control'>
                <CalendarDays size={17} aria-hidden='true' />
                <Button
                  variant='ghost'
                  size='icon'
                  aria-label='Mes anterior'
                  title='Mes anterior'
                  onClick={() =>
                    setMonth(addMonth(`${month}-01`, -1).slice(0, 7))
                  }
                >
                  <ChevronLeft size={17} />
                </Button>
                <label className='month-label' htmlFor='month-picker'>
                  {monthLabel}
                  <input
                    id='month-picker'
                    type='month'
                    aria-label='Mes del resumen'
                    value={month}
                    min='2000-01'
                    max='2100-12'
                    onClick={(event) => event.currentTarget.showPicker?.()}
                    onChange={(event) => setMonth(event.target.value)}
                  />
                </label>
                <Button
                  variant='ghost'
                  size='icon'
                  aria-label='Mes siguiente'
                  title='Mes siguiente'
                  onClick={() =>
                    setMonth(addMonth(`${month}-01`, 1).slice(0, 7))
                  }
                >
                  <ChevronRight size={17} />
                </Button>
              </div>
              <div
                className='currency-control'
                role='group'
                aria-label='Moneda del resumen'
              >
                {(["ARS", "USD"] as const).map((value) => (
                  <button
                    key={value}
                    aria-pressed={currency === value}
                    onClick={() => setCurrency(value)}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>
            <div className='top-actions'>
              <Button
                variant='ghost'
                size='icon'
                aria-label='Actualizar datos'
                title='Actualizar datos'
                disabled={revalidator.state !== "idle"}
                onClick={refresh}
              >
                <RefreshCw
                  size={17}
                  className={revalidator.state !== "idle" ? "spin" : ""}
                />
              </Button>
              <Button
                variant='ghost'
                size='icon'
                aria-label='Cambiar apariencia'
                title='Cambiar apariencia'
                onClick={() =>
                  setTheme(
                    document.documentElement.dataset.theme === "dark" ||
                      (theme === "system" &&
                        matchMedia("(prefers-color-scheme: dark)").matches)
                      ? "light"
                      : "dark",
                  )
                }
              >
                {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
              </Button>
            </div>
          </header>
          {!online && (
            <div className='connection-banner' role='status'>
              <WifiOff size={17} />
              Necesitás conexión para consultar y guardar movimientos.
            </div>
          )}
          {isMain && (
            <>
              <section className='summary' aria-label='Resumen mensual'>
                <div className='stat stat-accent'>
                  <div className='stat-label'>
                    Gasto del mes <span>· {currency}</span>
                  </div>
                  <div className='stat-value'>
                    {formatMoney(total, currency)}
                  </div>
                  <p>Compras, cuotas y cargos registrados</p>
                </div>
                <div className='stat'>
                  <div className='stat-label'>Pendiente del mes</div>
                  <div className='stat-value'>
                    {formatMoney(
                      pending.reduce((a, b) => a + b, 0),
                      currency,
                    )}
                  </div>
                  <p>
                    {pending.length
                      ? `${pending.length} compromiso${pending.length === 1 ? "" : "s"} por confirmar`
                      : "Todo al día por acá"}
                  </p>
                </div>
              </section>
            </>
          )}
          <div aria-busy={navigating || refreshing}>
            <Outlet />
          </div>
          <footer className='page-footer'>
            <span>Un poco de orden hace la diferencia.</span>
            <Link to={`/ajustes?mes=${month}`}>Configuración y respaldos</Link>
          </footer>
        </main>
        <MobileNavigation />
      </SidebarProvider>
      {composer && (
        <Suspense
          fallback={
            <Dialog
              title='Abriendo formulario…'
              onClose={() => setComposer(null)}
            >
              <div className='dialog-body muted'>Un momento…</div>
            </Dialog>
          }
        >
          <ComposerDialog
            key={JSON.stringify(composer)}
            composer={composer}
            onClose={() => setComposer(null)}
          />
        </Suspense>
      )}
      {confirmation && (
        <Dialog
          title={confirmation.title}
          description={confirmation.description}
          onClose={() => {
            if (!busy) setConfirmation(null)
          }}
        >
          <div className='dialog-body'>
            <p className='muted'>{confirmation.description}</p>
            {confirmError && (
              <p className='form-error' role='alert'>
                {confirmError}
              </p>
            )}
          </div>
          <div className='dialog-actions'>
            <Button
              variant='outline'
              disabled={busy}
              onClick={() => setConfirmation(null)}
            >
              Volver
            </Button>
            <Button
              variant={confirmation.destructive ? "danger" : "primary"}
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  await confirmation.action()
                  setNotice(confirmation.success)
                  setConfirmation(null)
                  refresh()
                } catch (e) {
                  setConfirmError(
                    e instanceof Error
                      ? e.message
                      : "No pudimos completar la operación.",
                  )
                } finally {
                  setBusy(false)
                }
              }}
            >
              {busy ? "Guardando…" : "Confirmar"}
            </Button>
          </div>
        </Dialog>
      )}
      {notice && (
        <div className='toast' role='status'>
          <CheckCircle2 size={19} />
          <span>{notice}</span>
          <button aria-label='Cerrar aviso' onClick={() => setNotice("")}>
            <X size={17} />
          </button>
        </div>
      )}
    </FinanceContext.Provider>
  )
}
