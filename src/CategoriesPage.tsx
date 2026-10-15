import { CurrencyFilter } from './components/CurrencyFilter';
import type { CurrencyView } from './context';
import { CategoryIcon, IconPicker } from './components/VisualIcon';
import { categoryIcon, type IconKey } from '../shared/icons';
import { useState } from 'react';
import { Edit3, LayoutGrid, Plus, Search, Table2, Tags, Trash2 } from 'lucide-react';
import { categoryInputSchema, type Currency, type Category } from '../shared/domain';
import { summarizeCategories, type CategorySummary } from '../shared/categories';
import { formatMoney, moneyInput, parseMoney } from '../shared/format';
import { useFinance } from './context';

import { movementTitle } from './lib/movements';
import { Button } from './components/ui/button';
import { Dialog } from './components/ui/dialog';
import './categories.css';

function CategoryEditor({ category, onClose }: { category: Category | null; onClose: () => void }) {
  const { mutate, notify } = useFinance();
  const [name, setName] = useState(category?.name || '');
  const emoji = category?.emoji || '🏷️';
  const [iconKey, setIconKey] = useState<IconKey>(categoryIcon(category));
  const [ars, setArs] = useState(moneyInput(category?.budgetArs || 0));
  const [usd, setUsd] = useState(moneyInput(category?.budgetUsd || 0));
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  return <Dialog title={category ? 'Editar categoría' : 'Nueva categoría'} description="Elegí un nombre, un ícono y, si querés, un presupuesto mensual." onClose={() => { if (!busy) onClose(); }}>
    <form onSubmit={async (event) => {
      event.preventDefault(); if (busy) return; setError('');
      const budgetArs = parseMoney(ars), budgetUsd = parseMoney(usd);
      if (budgetArs === null || budgetUsd === null) { setError('Ingresá presupuestos válidos, desde 0 y con hasta dos decimales.'); return; }
      const parsed = categoryInputSchema.safeParse({ name, emoji, iconKey, budgetArs, budgetUsd });
      if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
      setBusy(true);
      try {
        const outcome = await mutate(category ? `/categories/${category.id}` : '/categories', { ...parsed.data, ...(category ? { version: category.version } : {}) }, category ? 'PATCH' : 'POST');
        onClose(); notify(outcome.reconciled ? category ? 'Categoría actualizada.' : 'Categoría creada.' : 'Guardado. No pudimos actualizar las vistas. Volvé a actualizar.');
      } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
    }}>
      <div className="dialog-body form-stack">
        <div className="category-name-fields">

          <label className="field">Nombre<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Por ejemplo, Vivienda y hogar" required maxLength={80} disabled={busy} /></label>
        </div>
        <IconPicker value={iconKey} onChange={setIconKey} disabled={busy} />
        <div className="category-budget-fields">
          <label className="field">Presupuesto mensual ARS<input inputMode="decimal" value={ars} onChange={(e) => setArs(e.target.value)} disabled={busy} /></label>
          <label className="field">Presupuesto mensual USD<input inputMode="decimal" value={usd} onChange={(e) => setUsd(e.target.value)} disabled={busy} /></label>
        </div>
        <p className="muted small">Dejá 0 si no querés fijar un presupuesto. Se aplica a todos los meses en cada moneda.</p>
        {category && <p className="muted small">Al cambiar el nombre se actualizan sus gastos, cuotas y recurrentes. El ícono elegido se muestra también en el historial.</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
      <div className="dialog-actions"><Button variant="outline" type="button" disabled={busy} onClick={onClose}>Cancelar</Button><Button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar categoría'}</Button></div>
    </form>
  </Dialog>;
}

function DeleteCategory({ category, onClose }: { category: Category; onClose: () => void }) {
  const { data, mutate, notify } = useFinance();
  const [replacementId, setReplacementId] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  return <Dialog title="Eliminar categoría" description={`Vas a eliminar ${category.name}. Tus gastos y su historial se conservan.`} onClose={() => { if (!busy) onClose(); }}>
    <form onSubmit={async (event) => {
      event.preventDefault(); if (busy) return; setBusy(true); setError('');
      try {
        const outcome = await mutate(`/categories/${category.id}`, { version: category.version, replacementId: replacementId || null }, 'DELETE');
        onClose(); notify(outcome.reconciled ? 'Categoría eliminada.' : 'Guardado. No pudimos actualizar las vistas. Volvé a actualizar.');
      } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
    }}>
      <div className="dialog-body form-stack">
        <label className="field">Reasignar gastos, cuotas y recurrentes a<select value={replacementId} onChange={(e) => setReplacementId(e.target.value)} disabled={busy}><option value="">Sin categoría</option>{data.categories.filter((c) => c.id !== category.id).map((c) => <option value={c.id} key={c.id}>{c.name}</option>)}</select></label>
        <p className="muted small">El presupuesto de esta categoría se elimina. El de la categoría de destino se conserva.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
      <div className="dialog-actions"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancelar</Button><Button type="submit" variant="danger" disabled={busy}>{busy ? 'Eliminando…' : 'Eliminar categoría'}</Button></div>
    </form>
  </Dialog>;
}

export function CategoriesPage() {
  const { data, month } = useFinance();
  const [selectedCurrency, setSelectedCurrency] = useState<CurrencyView>('ALL');
  const currencyLabel = selectedCurrency === 'ALL' ? 'ARS / USD' : selectedCurrency;
  const [view, setView] = useState<'gallery' | 'table'>('gallery');
  const [search, setSearch] = useState('');
  const [editor, setEditor] = useState<{ category: Category | null } | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [detailName, setDetailName] = useState<string | null>(null);
  const currencies: Currency[] = selectedCurrency === 'ALL' ? ['ARS', 'USD'] : [selectedCurrency];
  const summaries = currencies.flatMap((currency) => summarizeCategories(data, month, currency).map((row) => ({ ...row, currency })));
  const rows = summaries.filter((row) => row.name.toLocaleLowerCase('es').includes(search.trim().toLocaleLowerCase('es')));
  const detail = summaries.find((row) => `${row.currency}:${row.name}` === detailName);
  const actions = (row: CategorySummary) => row.category && <div className="category-actions">
    <Button variant="ghost" size="icon" aria-label={`Editar ${row.name}`} onClick={() => setEditor({ category: row.category })}><Edit3 size={16} /></Button>
    <Button variant="ghost" size="icon" aria-label={`Eliminar ${row.name}`} onClick={() => setDeleting(row.category)}><Trash2 size={16} /></Button>
  </div>;
  const title = (row: CategorySummary & { currency: Currency }) => <button className="category-title" onClick={() => setDetailName(`${row.currency}:${row.name}`)} aria-label={`Ver gastos de ${row.name}${selectedCurrency === "ALL" ? ` en ${row.currency}` : ""}`}><CategoryIcon category={row.category} /><strong>{row.name}{selectedCurrency === "ALL" && <small className="category-currency">{row.currency}</small>}</strong></button>;
  return <>
    <div className="page-heading"><div><h1>Categorías</h1><p>Organizá tus gastos y encontrá en qué se va tu mes.</p></div><Button onClick={() => setEditor({ category: null })}><Plus size={18} />Nueva categoría</Button></div>
    <div className="list-toolbar category-toolbar">
      <div className="filter-tabs" role="group" aria-label="Vista de categorías">
        <button aria-pressed={view === 'gallery'} onClick={() => setView('gallery')}><LayoutGrid size={16} />Galería</button>
        <button aria-pressed={view === 'table'} onClick={() => setView('table')}><Table2 size={16} />Tabla</button>
      </div>
      <CurrencyFilter value={selectedCurrency} onChange={setSelectedCurrency} /><label className="search-box"><Search size={16} /><input aria-label="Buscar categorías" placeholder="Buscar categoría…" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
    </div>
    <div className="category-caption"><span>{data.categories.length} {data.categories.length === 1 ? 'categoría personal' : 'categorías personales'}</span><span>Gastos registrados · {currencyLabel} · {month.split('-').reverse().join('/')}</span></div>
    {!rows.length ? <div className="list-surface empty-state"><span className="empty-icon" aria-hidden="true"><Tags size={30} /></span><h3>{search ? 'No encontramos esa categoría' : 'Dale un lugar a cada gasto'}</h3><p>{search ? 'Probá con otro nombre.' : 'Creá tu primera categoría con el nombre e ícono que prefieras.'}</p>{!search && <Button variant="outline" onClick={() => setEditor({ category: null })}><Plus size={16} />Crear categoría</Button>}</div> : view === 'gallery' ?
      <div className="category-grid">{rows.map((row) => <article className="category-card" key={`${row.currency}:${row.name}`}>
        <div className="category-card-heading">{title(row)}{actions(row)}</div>
        <dl className="category-metrics">
          <div><dt>Presupuesto</dt><dd>{row.budget ? formatMoney(row.budget, row.currency) : 'Sin definir'}</dd></div>
          <div><dt>Mes actual</dt><dd className={row.budget && row.current > row.budget ? 'danger-text' : ''}>{formatMoney(row.current, row.currency)}</dd></div>
          <div><dt>Mes anterior</dt><dd>{formatMoney(row.previous, row.currency)}</dd></div>
        </dl>
        {row.budget > 0 && <div className="category-budget"><div className="category-budget-track" role="progressbar" aria-label={`Presupuesto utilizado de ${row.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round(row.current / row.budget * 100))}><span className={row.current > row.budget ? 'over-budget' : ''} style={{ width: `${Math.min(100, row.current / row.budget * 100)}%` }} /></div><span>{Math.round(row.current / row.budget * 100)}% utilizado</span></div>}
      </article>)}</div> :
      <div className="category-table-wrap"><table className="category-table"><caption className="sr-only">Categorías y gastos en {currencyLabel} del mes {month}</caption><thead><tr><th scope="col">Categoría</th><th scope="col">Presupuesto</th><th scope="col">Mes actual</th><th scope="col">Mes anterior</th><th scope="col"><span className="sr-only">Acciones</span></th></tr></thead><tbody>{rows.map((row) => <tr key={`${row.currency}:${row.name}`}><th scope="row">{title(row)}</th><td>{row.budget ? formatMoney(row.budget, row.currency) : 'Sin definir'}</td><td className={row.budget && row.current > row.budget ? 'danger-text' : ''}>{formatMoney(row.current, row.currency)}</td><td>{formatMoney(row.previous, row.currency)}</td><td>{actions(row)}</td></tr>)}</tbody></table></div>}
    <p className="muted small category-footnote">Los importes siguen el mes y la moneda seleccionados. Las cuotas y recurrentes cuentan cuando registrás el cargo o pago.</p>
    {editor && <CategoryEditor category={editor.category} onClose={() => setEditor(null)} />}
    {deleting && <DeleteCategory category={deleting} onClose={() => setDeleting(null)} />}
    {detail && <Dialog title={detail.name} description={`Gastos registrados en ${currencyLabel} · ${month.split('-').reverse().join('/')}`} onClose={() => setDetailName(null)}><div className="dialog-body"><div className="category-detail-total"><span className="muted">Mes actual</span><strong>{formatMoney(detail.current, detail.currency)}</strong></div>{detail.movements.length ? <ul className="category-detail-list">{[...detail.movements].sort((a, b) => b.date.localeCompare(a.date)).map((m) => <li key={m.id}><div><strong className={!m.concept.trim() ? 'muted' : undefined}><CategoryIcon category={detail.category} small /> {movementTitle(m)}</strong><p className="muted small">{m.date.split('-').reverse().join('/')} · {data.accounts.find((a) => a.id === m.accountId)?.name}{!detail.category && ` · ${m.category}`}</p></div><strong>{formatMoney(m.expenseAmount, m.currency)}</strong></li>)}</ul> : <p className="muted small">Todavía no hay gastos registrados en esta categoría para este mes.</p>}</div><div className="dialog-actions"><Button variant="outline" onClick={() => setDetailName(null)}>Cerrar</Button>{detail.category && <Button onClick={() => { setDetailName(null); setEditor({ category: detail.category }); }}><Edit3 size={15} />Editar categoría</Button>}</div></Dialog>}
  </>;
}
