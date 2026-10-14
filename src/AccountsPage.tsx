import { AccountIcon } from './components/AccountIcon';
import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { Archive, ArrowRight, Edit3, Plus, RotateCcw, Search, Trash2, Wallet } from 'lucide-react';
import { useFinance } from './context';
import { Button } from './components/ui/button';

import { accountColor, accountIconColor, accountTypes } from './lib/account-appearance';
import type { FinanceAccount } from '../shared/domain';
import './accounts.css';


export function AccountsPage() {
  const { data, month, open, confirm, mutate } = useFinance();
  const [search, setSearch] = useState('');
  const [archived, setArchived] = useState(false);
  const activeCount = data.accounts.filter((account) => !account.archived).length;
  const rows = data.accounts.filter((account) => account.archived === archived && account.name.toLocaleLowerCase('es').includes(search.trim().toLocaleLowerCase('es')));
  function toggleArchive(account: FinanceAccount) {
    confirm({
      title: account.archived ? `¿Reactivar ${account.name}?` : `¿Archivar ${account.name}?`,
      description: account.archived ? 'La cuenta volverá a estar disponible para nuevos movimientos.' : 'Se conserva el historial. Primero deben resolverse las cuotas y recurrentes pendientes.',
      action: () => mutate(`/accounts/${account.id}`, { name: account.name, emoji: account.emoji, archived: !account.archived, version: account.version }, 'PATCH'),
      success: account.archived ? 'Cuenta reactivada.' : 'Cuenta archivada.',
    });
  }
  function remove(account: FinanceAccount) {
    confirm({
      title: `¿Eliminar ${account.name}?`,
      description: 'Se eliminarán esta cuenta y sus movimientos, cuotas y recurrentes asociados. Las transferencias antiguas vinculadas también desaparecerán del historial de la otra cuenta. Esta acción no se puede deshacer.',
      action: () => mutate(`/accounts/${account.id}`, { version: account.version }, 'DELETE'),
      success: 'Cuenta eliminada.', destructive: true,
    });
  }
  return <>
    <div className="page-heading"><div><h1>Cuentas</h1><p>Tus bancos, billeteras y tarjetas, en un solo lugar.</p></div><Button onClick={() => open({ type: 'account' })}><Plus size={18} />Agregar cuenta</Button></div>
    <div className="list-toolbar accounts-toolbar">
      <div className="filter-tabs" role="group" aria-label="Estado de las cuentas">
        <button aria-pressed={!archived} onClick={() => setArchived(false)}>Activas <span>{activeCount}</span></button>
        <button aria-pressed={archived} onClick={() => setArchived(true)}>Archivadas <span>{data.accounts.length - activeCount}</span></button>
      </div>
      <label className="search-box"><Search size={16} aria-hidden="true" /><input aria-label="Buscar cuentas" placeholder="Buscar cuenta…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
    </div>
    <p className="accounts-caption">Todas tus monedas · {rows.length} {rows.length === 1 ? 'cuenta' : 'cuentas'}</p>
    {rows.length ? <div className="accounts-grid">{rows.map((account) => {
      const color = account.color ?? accountColor(account.name, account.type);
      return <article className="account-card" key={account.id} aria-label={account.name} style={{ '--account-color': color, '--account-ink': accountIconColor(color) } as CSSProperties}>
        <div className="account-card-body">
          <div className="account-card-top"><AccountIcon account={account} /><span className="account-currency">{account.currency}</span></div>
          <Link className="account-card-title" to={`/cuentas/${account.id}?mes=${month}`}><h2>{account.name}</h2></Link>
          <p className="muted small">{accountTypes[account.type]}{account.archived && ' · Archivada'}</p>
        </div>
        <div className="account-card-footer">
          <Link className="account-history-link" to={`/cuentas/${account.id}?mes=${month}`} aria-label={`Ver historial de ${account.name}`}>Ver historial <ArrowRight size={15} aria-hidden="true" /></Link>
          <div className="account-card-actions">
            <Button variant="ghost" size="icon" aria-label={`Editar ${account.name}`} title="Editar cuenta" onClick={() => open({ type: 'account', account })}><Edit3 size={16} /></Button>
            <Button variant="ghost" size="icon" aria-label={`${account.archived ? 'Reactivar' : 'Archivar'} ${account.name}`} title={account.archived ? 'Reactivar cuenta' : 'Archivar cuenta'} onClick={() => toggleArchive(account)}>{account.archived ? <RotateCcw size={16} /> : <Archive size={16} />}</Button>
            <Button variant="ghost" size="icon" aria-label={`Eliminar ${account.name}`} title="Eliminar cuenta" onClick={() => remove(account)}><Trash2 size={16} /></Button>
          </div>
        </div>
      </article>;
    })}</div> : <div className="list-surface empty-state"><span className="empty-icon" aria-hidden="true"><Wallet size={30} /></span><h3>{search ? 'No encontramos esa cuenta' : archived ? 'No tenés cuentas archivadas' : 'Tu primera cuenta, el primer paso'}</h3><p>{search ? 'Probá con otro nombre o cambiá de pestaña.' : archived ? 'Las cuentas que archives aparecerán acá con su historial.' : 'Agregá un banco, billetera, tarjeta o efectivo para empezar a registrar tus gastos.'}</p>{!search && !archived && <Button variant="outline" onClick={() => open({ type: 'account' })}><Plus size={16} />Crear mi primera cuenta</Button>}</div>}
    <p className="muted small accounts-footnote">Archivá las cuentas que ya no usás para conservar su historial. También podés eliminarlas definitivamente junto con sus registros asociados.</p>
  </>;
}
