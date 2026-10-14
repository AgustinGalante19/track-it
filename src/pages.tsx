import { CategoryIcon, VisualIcon } from './components/VisualIcon'
import { quickServices, recurringIcon } from '../shared/icons'
import { useCallback, useState, useSyncExternalStore } from "react"
import { Link, useParams } from "react-router-dom"
import { financeStore } from './lib/finance-client'
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Copy,
  Edit3,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
  Wallet,
} from "lucide-react"
import { useFinance } from "./context"
import { Button } from "./components/ui/button"
import { Dialog } from "./components/ui/dialog"

import { movementTitle } from "./lib/movements"
import type {
  Movement,
  Posting,
  InstallmentPlan,
  Recurring,
  Currency,
} from "../shared/domain"
import { formatMoney, today } from "../shared/format"

function dateLabel(date: string) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`))
}
function Empty({
  icon = "🌿",
  title,
  description,
  action,
}: {
  icon?: string
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className='empty-state'>
      <span className='empty-icon' aria-hidden='true'>
        {icon}
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  )
}
function Header({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className='page-heading'>
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  )
}
function SearchBox({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className='search-box'>
      <Search size={16} />
      <input
        aria-label='Buscar por concepto'
        placeholder='Buscar…'
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}
export function MovementRow({
  movement,
  delta,
  displayCurrency,
  showSource = false,
}: {
  movement: Movement
  delta?: number
  displayCurrency?: Currency
  showSource?: boolean
}) {
  const { data, open, confirm, mutate } = useFinance()
  const source = data.accounts.find((a) => a.id === movement.accountId)
  const destination = data.accounts.find((a) => a.id === movement.destinationId)
  const isExpense = movement.kind === "expense"
  const relation =
    movement.kind === "transfer"
      ? `${source?.name} ${movement.direction === "incoming" ? "←" : "→"} ${destination?.name || movement.counterpart}`
      : source?.name
  const amount = delta === undefined ? movement.amount : Math.abs(delta)
  const [actionsOpen, setActionsOpen] = useState(false)
  return (
    <div className={`movement-row ${movement.voided ? "row-voided" : ""}`}>
      <CategoryIcon category={data.categories.find((c) => c.name === movement.category)} />
      <div className='row-content'>
        <strong>
          {movementTitle(movement)}
        </strong>
        <p>
          {dateLabel(movement.date)} <span>·</span>{" "}
          {relation}
        </p>
        {movement.notes && <p className='row-note'>{movement.notes}</p>}
        {showSource && movement.sourceType !== "single" && (
          <span className='badge'>
            {movement.sourceType === "recurring" ? "Recurrente" : "Cuota"}
          </span>
        )}
        {movement.voided && (
          <span className='badge badge-muted'>
            Anulado · conservado en historial
          </span>
        )}
        {movement.fee > 0 && (
          <p className='row-note'>
            Comisión: {formatMoney(movement.fee, movement.currency)}
          </p>
        )}
      </div>
      <div className='row-end'>
        <strong className={delta !== undefined && delta > 0 ? "positive" : ""}>
          {delta !== undefined ? (delta > 0 ? "+ " : "− ") : ""}
          {formatMoney(amount, displayCurrency || movement.currency)}
        </strong>
        {movement.destinationCurrency &&
          movement.destinationCurrency !== movement.currency &&
          delta === undefined && (
            <p>
              {formatMoney(
                movement.receivedAmount || 0,
                movement.destinationCurrency,
              )}{" "}
              recibidos
            </p>
          )}
        {movement.kind === "transfer" && delta === undefined && (
          <span
            className={`badge ${movement.expenseAmount > 0 ? "badge-warm" : ""}`}
          >
            {movement.expenseAmount > 0
              ? movement.classification === "expense"
                ? "Gasto externo"
                : "Solo comisión"
              : destination?.type === "credit"
                ? "Pago de tarjeta"
                : movement.classification === "income"
                  ? "Ingreso externo"
                  : "Sin gasto"}
          </span>
        )}
      </div>
      {!movement.voided && (
        <div className='row-menu'>
          <Button
            variant='ghost'
            size='icon'
            aria-label={`Opciones de ${movementTitle(movement)}`}
            aria-expanded={actionsOpen}
            onClick={() => setActionsOpen(!actionsOpen)}
          >
            <MoreHorizontal size={18} />
          </Button>
          {actionsOpen && (
            <div className='row-menu-content'>
              {isExpense && movement.sourceType === "single" && (
                <button
                  onClick={() => {
                    open({ type: "expense", movement })
                    setActionsOpen(false)
                  }}
                >
                  <Edit3 size={14} />
                  Editar
                </button>
              )}
              {isExpense && movement.sourceType === "single" && (
                <button
                  onClick={() => {
                    open({
                      type: "expense",
                      movement: { ...movement, date: today() },
                      duplicate: true,
                    })
                    setActionsOpen(false)
                  }}
                >
                  <Copy size={14} />
                  Duplicar
                </button>
              )}
              <button
                className='danger-text'
                onClick={() => {
                  setActionsOpen(false)
                  confirm({
                    title: "¿Anular este movimiento?",
                    description:
                      "El movimiento deja de contar en el gasto registrado. El registro queda en el historial. Si es un cargo de cuota o servicio, vuelve a estar pendiente.",
                    action: () =>
                      mutate(`/movements/${movement.id}/void`, {
                        version: movement.version,
                      }),
                    success: "Movimiento anulado.",
                    destructive: true,
                  })
                }}
              >
                <Trash2 size={14} />
                Anular
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
function PlanRow({ plan }: { plan: InstallmentPlan }) {
  const { data, month, open, confirm, mutate } = useFinance()
  const [expanded, setExpanded] = useState(false)
  const account = data.accounts.find((a) => a.id === plan.accountId)!
  const schedule = data.installments
    .filter((i) => i.planId === plan.id)
    .sort((a, b) => a.number - b.number)
  const completed = schedule.filter((i) =>
    ["charged", "historical"].includes(i.status),
  ).length
  const remaining = schedule
    .filter((i) => i.status === "pending")
    .reduce((sum, i) => sum + i.amount, 0)
  const current = schedule.find((i) => i.dueDate.startsWith(month))
  return (
    <div className='plan-item'>
      <div className='movement-row'>
        <CategoryIcon category={data.categories.find((c) => c.name === plan.category)} />
        <button
          className='row-content plan-trigger'
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
        >
          <strong>
            {plan.name}
            <ChevronDown size={15} className={expanded ? "rotate" : ""} />
          </strong>
          <p>
            {plan.category} · {account.name} · {completed} de {plan.count}{" "}
            registradas
          </p>
          <div className='progress-track'>
            <span style={{ width: `${(completed / plan.count) * 100}%` }} />
          </div>
        </button>
        <div className='row-end'>
          <strong>{formatMoney(current?.amount || 0, account.currency)}</strong>
          <span
            className={`badge ${current?.status === "pending" ? "badge-warm" : ""}`}
          >
            {!plan.active
              ? "Cancelada"
              : current
                ? current.status === "charged" ||
                  current.status === "historical"
                  ? "Cuota registrada"
                  : current.status === "cancelled"
                    ? "Cancelada"
                    : `Cuota ${current.number}/${plan.count}`
                : "Sin cuota este mes"}
          </span>
        </div>
        {current?.status === "pending" && (
          <Button
            variant='outline'
            size='sm'
            onClick={() => open({ type: "charge", installment: current })}
          >
            {account.type === "credit" ? "Registrar cargo" : "Confirmar pago"}
          </Button>
        )}
      </div>
      {expanded && (
        <div className='plan-details'>
          <div className='plan-overview'>
            <span>
              Total financiado{" "}
              <strong>{formatMoney(plan.total, account.currency)}</strong>
            </span>
            <span>
              Cuotas aún sin registrar{" "}
              <strong>{formatMoney(remaining, account.currency)}</strong>
            </span>
          </div>
          <div className='schedule'>
            {schedule.map((i) => (
              <div className='schedule-row' key={i.id}>
                <span>
                  Cuota {i.number}{" "}
                  <small>
                    {dateLabel(i.dueDate)} {i.dueDate.slice(0, 4)}
                  </small>
                </span>
                <strong>{formatMoney(i.amount, account.currency)}</strong>
                {i.status === "pending" ? (
                  <Button
                    size='sm'
                    variant='ghost'
                    onClick={() => open({ type: "charge", installment: i })}
                  >
                    {account.type === "credit"
                      ? "Registrar cargo"
                      : "Confirmar pago"}
                  </Button>
                ) : (
                  <span className='badge badge-muted'>
                    {i.status === "historical"
                      ? "Pagada anteriormente"
                      : i.status === "charged"
                        ? "Registrada"
                        : "Cancelada"}
                  </span>
                )}
              </div>
            ))}
          </div>
          {plan.active && remaining > 0 && (
            <button
              className='text-action danger-text'
              onClick={() =>
                confirm({
                  title: "¿Cancelar cuotas futuras?",
                  description:
                    "Las cuotas pendientes se cancelan. Los cargos ya registrados y su historial se conservan.",
                  action: () =>
                    mutate(`/plans/${plan.id}/cancel`, { version: plan.version }),
                  success: "Cuotas futuras canceladas.",
                  destructive: true,
                })
              }
            >
              Cancelar cuotas pendientes
            </button>
          )}
        </div>
      )}
    </div>
  )
}
export function ExpensesPage() {
  const { data, month, currency, open } = useFinance()
  const [filter, setFilter] = useState("all"),
    [search, setSearch] = useState(""),
    [accountFilter, setAccountFilter] = useState("all"),
    [categoryFilter, setCategoryFilter] = useState("all")
  const matches = (name: string, accountId: string, category: string) =>
    name.toLocaleLowerCase("es").includes(search.toLocaleLowerCase("es")) &&
    (accountFilter === "all" || accountFilter === accountId) &&
    (categoryFilter === "all" || categoryFilter === category)
  const singles = data.movements
    .filter(
      (m) =>
        !m.voided &&
        m.kind === "expense" &&
        m.sourceType === "single" &&
        m.currency === currency &&
        m.date.startsWith(month) &&
        matches(movementTitle(m), m.accountId, m.category),
    )
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
    )
  const plans = data.plans.filter(
    (p) =>
      data.accounts.find((a) => a.id === p.accountId)?.currency === currency &&
      matches(p.name, p.accountId, p.category) &&
      data.installments.some(
        (i) =>
          i.planId === p.id &&
          (i.dueDate.startsWith(month) ||
            (i.status === "pending" && i.dueDate < `${month}-01`)),
      ),
  )
  const visibleCount =
    (filter !== "installments" ? singles.length : 0) +
    (filter !== "single" ? plans.length : 0)
  const canAdd = data.accounts.some((a) => !a.archived)
  return (
    <>
      <Header
        title='Gastos'
        description='Compras del día a día, con todo en su lugar.'
        action={
          <>
            {canAdd ? (
              <Button onClick={() => open({ type: "expense" })}>
                <Plus size={18} />
                Agregar gasto
              </Button>
            ) : (
              <Link className='btn btn-primary' to={`/cuentas?mes=${month}`}>
                <Plus size={18} />
                Configurar cuentas
              </Link>
            )}
          </>
        }
      />
      <div className='list-toolbar'>
        <div className='filter-tabs' role='group' aria-label='Tipo de gasto'>
          {[
            ["all", "Todos"],
            ["single", "Únicos"],
            ["installments", "En cuotas"],
          ].map(([value, label]) => (
            <button
              key={value}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <SearchBox value={search} onChange={setSearch} />
      </div>
      <div className='secondary-filters'>
        <select
          aria-label='Filtrar por cuenta'
          value={accountFilter}
          onChange={(e) => setAccountFilter(e.target.value)}
        >
          <option value='all'>Todas las cuentas</option>
          {data.accounts
            .filter((a) => a.currency === currency)
            .map((a) => (
              <option value={a.id} key={a.id}>
                {a.name}
              </option>
            ))}
        </select>
        <select
          aria-label='Filtrar por categoría'
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value='all'>Todas las categorías</option>
          {[
            ...new Set([
              ...data.categories.map((c) => c.name),
              ...data.movements.map((m) => m.category),
            ]),
          ].map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <span>
          {visibleCount} {visibleCount === 1 ? "compra" : "compras"}
        </span>
      </div>
      <div className='list-surface'>
        {filter !== "single" &&
          plans.map((plan) => <PlanRow key={plan.id} plan={plan} />)}
        {filter !== "installments" &&
          singles.map((movement) => (
            <MovementRow key={movement.id} movement={movement} />
          ))}
        {!visibleCount && (
          <Empty
            title={search ? "No encontramos esa compra" : "Un mes por escribir"}
            description={
              search
                ? "Probá con otro concepto o ajustá los filtros."
                : `Tus compras en ${currency} aparecerán acá. Agregá la primera cuando quieras.`
            }
          />
        )}
      </div>
    </>
  )
}
export function RecurringPage() {
  const { data, month, currency, open, confirm, mutate } = useFinance()
  const [search, setSearch] = useState("")
  const accounts = new Map(data.accounts.map((a) => [a.id, a]))
  const periods = data.occurrences
    .filter(
      (p) =>
        accounts.get(p.accountId)?.currency === currency &&
        p.name
          .toLocaleLowerCase("es")
          .includes(search.toLocaleLowerCase("es")) &&
        (p.period === month || (p.status === "pending" && p.period < month)),
    )
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const rules = data.recurring.filter(
    (r) =>
      accounts.get(r.accountId)?.currency === currency &&
      r.name.toLocaleLowerCase("es").includes(search.toLocaleLowerCase("es")),
  )
  const paused = rules.filter((r) => !r.active)
  const withoutPeriods = rules.filter(
    (r) => r.active && !periods.some((p) => p.ruleId === r.id),
  )
  function toggle(rule: Recurring) {
    confirm({
      title: rule.active
        ? "¿Pausar este recurrente?"
        : "¿Reanudar este recurrente?",
      description: rule.active
        ? "No se generarán nuevos períodos. Los pagos anteriores y los pendientes de este mes se conservan."
        : "Se generarán períodos desde este mes. Los meses de la pausa no se cobran retroactivamente.",
      action: () =>
        mutate(`/recurring/${rule.id}`, { ...rule, active: !rule.active }, "PUT"),
      success: rule.active ? "Recurrente pausado." : "Recurrente reanudado.",
    })
  }
  function remove(rule: Recurring) {
    confirm({
      title: `¿Eliminar ${rule.name}?`,
      description:
        "El recurrente se quitará de la lista y no generará nuevos períodos. Se descartarán todos sus períodos pendientes, incluidos los vencidos. Los pagos ya registrados se conservan en el historial de la cuenta. Esta acción no se puede deshacer.",
      action: () =>
        mutate(`/recurring/${rule.id}`, { version: rule.version }, "DELETE"),
      success: "Recurrente eliminado.",
      destructive: true,
    })
  }
  function ruleRow(rule: Recurring) {
    return (
      <div className='paused-row' key={rule.id}>
        <span>
          <VisualIcon iconKey={recurringIcon(rule, data.categories.find((c) => c.name === rule.category))} small /> {rule.name}
        </span>
        <div className='inline-actions'>
          {rule.active && (
            <Button
              size='sm'
              variant='ghost'
              onClick={() => open({ type: "recurring", rule })}
            >
              <Edit3 size={14} />
              Editar
            </Button>
          )}
          <Button size='sm' variant='ghost' onClick={() => toggle(rule)}>
            {rule.active ? <Pause size={14} /> : <Play size={14} />}
            {rule.active ? "Pausar" : "Reanudar"}
          </Button>
          <Button
            size='sm'
            variant='ghost'
            className='danger-text'
            onClick={() => remove(rule)}
          >
            <Trash2 size={14} />
            Eliminar
          </Button>
        </div>
      </div>
    )
  }
  return (
    <>
      <Header
        title='Recurrentes'
        description='Servicios y suscripciones. Menos cosas para recordar.'
        action={
          <>
            {data.accounts.some((a) => !a.archived) ? (
              <Button onClick={() => open({ type: "recurring" })}>
                <Plus size={18} />
                Agregar recurrente
              </Button>
            ) : (
              <Link className='btn btn-primary' to={`/cuentas?mes=${month}`}>
                <Plus size={18} />
                Configurar cuentas
              </Link>
            )}
          </>
        }
      />
      <div className='list-toolbar'>
        <p className='muted small'>
          Importes estimados hasta que confirmás el pago.
        </p>
        <SearchBox value={search} onChange={setSearch} />
      </div>
      <section className='quick-services' aria-label='Agregar servicios rápidamente'>
        <h2>Agregar rápido</h2>
        <div className='quick-service-list'>{quickServices.map((preset) => <button key={preset.name} disabled={!data.accounts.some((a) => !a.archived)} onClick={() => open({ type: 'recurring', preset })}><VisualIcon iconKey={preset.iconKey} small />{preset.name}<Plus size={14} aria-hidden='true' /></button>)}</div>
      </section>
      <div className='list-surface recurring-list'>
        {periods.map((period) => {
          const account = accounts.get(period.accountId)!
          const rule = data.recurring.find((r) => r.id === period.ruleId)!
          const late = period.status === "pending" && period.dueDate < today()
          const paid = data.movements.find((m) => m.id === period.movementId)
          return (
            <div className='recurring-item' key={period.id}>
              <div className='movement-row'>
                <VisualIcon iconKey={recurringIcon(rule, data.categories.find((c) => c.name === rule.category))} />
                <div className='row-content'>
                  <strong>{period.name}</strong>
                  <p>
                    {dateLabel(period.dueDate)} ·{" "}
                    {rule.kind === "subscription" ? "Suscripción" : "Servicio"}{" "}
                    · {account.name}
                  </p>
                  {period.period < month && (
                    <span className='badge badge-warm'>
                      Pendiente de {period.period}
                    </span>
                  )}
                </div>
                <div className='row-end'>
                  <strong>
                    {formatMoney(
                      paid?.amount || period.amount,
                      account.currency,
                    )}
                  </strong>
                  <span
                    className={`badge ${late ? "badge-danger" : period.status === "pending" ? "badge-warm" : ""}`}
                  >
                    {period.status === "paid"
                      ? account.type === "credit"
                        ? "Cargo registrado"
                        : "Pagado"
                      : period.status === "skipped"
                        ? "Omitido"
                        : late
                          ? "Vencido"
                          : "Pendiente"}
                  </span>
                </div>
                {period.status === "pending" && (
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => open({ type: "charge", occurrence: period })}
                  >
                    {account.type === "credit"
                      ? "Registrar cargo"
                      : "Confirmar pago"}
                  </Button>
                )}
              </div>
              <div className='recurring-actions'>
                <button onClick={() => open({ type: "recurring", rule })}>
                  <Edit3 size={13} />
                  Editar regla futura
                </button>
                <button onClick={() => toggle(rule)}>
                  {rule.active ? <Pause size={13} /> : <Play size={13} />}
                  {rule.active ? "Pausar" : "Reanudar"}
                </button>
                <details className='recurring-overflow'><summary aria-label={`Más acciones de ${period.name}`}><MoreHorizontal size={20} /></summary><div className='row-menu-content'>
                {period.status === "pending" && (
                  <button
                    onClick={() =>
                      confirm({
                        title: "¿Omitir este período?",
                        description:
                          "Este período quedará omitido, sin generar un gasto. Los meses siguientes siguen su regla.",
                        action: () =>
                          mutate(
                            `/occurrences/${encodeURIComponent(period.id)}/skip`,
                            {},
                          ),
                        success: "Período omitido.",
                      })
                    }
                  >
                    Omitir este período
                  </button>
                )}
                <button className='danger-text' onClick={() => remove(rule)}>
                  <Trash2 size={13} />
                  Eliminar recurrente
                </button>
                </div></details>
              </div>
            </div>
          )
        })}
        {!periods.length && (
          <Empty
            icon='📶'
            title='Tus próximos pagos, a mano'
            description={`Agregá tus servicios y suscripciones en ${currency}. Cada pago se confirma manualmente.`}
          />
        )}
      </div>
      {withoutPeriods.length > 0 && (
        <section className='paused-section'>
          <h2>Sin períodos en este mes</h2>
          {withoutPeriods.map(ruleRow)}
        </section>
      )}
      {paused.length > 0 && (
        <section className='paused-section'>
          <h2>Pausados</h2>
          {paused.map(ruleRow)}
        </section>
      )}
    </>
  )
}
export function AccountPage() {
  const { id } = useParams()
  const { data, open, confirm, month, mutate } = useFinance()
  const state = useSyncExternalStore(useCallback((listener: () => void) => financeStore.subscribeHistory(id!, listener), [id]), financeStore.getState)
  const historyState = state.histories[id!]
  const history = historyState?.rows ?? []
  const account = data.accounts.find((a) => a.id === id)
  if (!account)
    return (
      <Empty
        title='No encontramos esta cuenta'
        description='Volvé a tus cuentas y actualizá los datos.'
      />
    )
  const isCredit = account.type === "credit"
  return (
    <>
      <Link className='back-link' to={`/cuentas?mes=${month}`}>
        <ArrowLeft size={16} />
        Volver a Cuentas
      </Link>
      <Header
        title={`${account.emoji} ${account.name}`}
        description={`${account.currency} · ${account.archived ? "Cuenta archivada" : isCredit ? "Tarjeta de crédito" : account.type === "wallet" ? "Billetera virtual" : account.type === "cash" ? "Efectivo" : "Cuenta bancaria"}`}
        action={
          <Button
            variant='outline'
            onClick={() => open({ type: "account", account })}
          >
            <Edit3 size={15} />
            Editar cuenta
          </Button>
        }
      />
      <div className='account-history-actions'>
        {!account.archived && !isCredit && (
          <Button
            variant='outline'
            onClick={() => open({ type: "income", accountId: id })}
          >
            Registrar ingreso
          </Button>
        )}
      </div>
      <h2 className='list-heading'>Historial de la cuenta</h2>
      {historyState?.stale && <p role={historyState.error ? 'alert' : 'status'} className='muted small'>
        {historyState.error ? 'No pudimos actualizar el historial.' : 'Actualizando historial…'}
        {historyState.error && <Button variant='ghost' onClick={() => void financeStore.loadHistory({ accountId: id!, force: true }).catch(() => {})}>Reintentar</Button>}
      </p>}
      <div className='list-surface'>
        {[...history]
          .sort(
            (a, b) =>
              b.movement.date.localeCompare(a.movement.date) ||
              b.movement.createdAt.localeCompare(a.movement.createdAt),
          )
          .map(({ posting, movement }) => (
            <MovementRow
              key={posting.id}
              movement={movement}
              delta={posting.delta}
              displayCurrency={account.currency}
              showSource
            />
          ))}
        {!history.length && (
          <Empty
            icon='🏦'
            title='El punto de partida está listo'
            description='Los movimientos registrados en esta cuenta aparecerán acá.'
          />
        )}
      </div>
      <Button
        className='archive-button'
        variant='ghost'
        onClick={() =>
          confirm({
            title: account.archived
              ? "¿Reactivar cuenta?"
              : "¿Archivar cuenta?",
            description: account.archived
              ? "La cuenta volverá a estar disponible para nuevos movimientos."
              : "Se conserva el historial. Primero deben resolverse cuotas y recurrentes pendientes.",
            action: () =>
              mutate(
                `/accounts/${account.id}`,
                {
                  name: account.name,
                  emoji: account.emoji,
                  archived: !account.archived,
                  version: account.version,
                },
                "PATCH",
              ),
            success: account.archived
              ? "Cuenta reactivada."
              : "Cuenta archivada.",
          })
        }
      >
        {account.archived ? "Reactivar cuenta" : "Archivar cuenta"}
      </Button>
    </>
  )
}
