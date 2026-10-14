import { AccountIcon } from './components/AccountIcon';
import { CategoryIcon, IconPicker } from './components/VisualIcon';
import { categoryIcon, recurringIconChoice, type IconKey } from '../shared/icons';
import { createContext, useContext, useRef, useState } from 'react';
import { useForm, type FieldErrors } from 'react-hook-form';
import { z } from 'zod';
import { LoaderCircle, Info } from 'lucide-react';
import { useFinance, type Composer, type Mutate } from './context';
import { Dialog } from './components/ui/dialog';
import { Button } from './components/ui/button';
import { accountColor } from './lib/account-appearance';
import './account-color.css';
import { accountInputSchema, expenseInputSchema, recurringInputSchema, planInputSchema, incomeInputSchema, chargeInputSchema, formatMoney, moneyInput, parseMoney, splitInstallments, today } from '../shared/domain';

type Values = { concept: string; amount: string; date: string; accountId: string; category: string; emoji: string; notes: string; payment: string; count: string; historicalCount: string; firstDate: string; kind: 'subscription' | 'service'; dueDay: string; startDate: string; name: string; type: 'bank' | 'wallet' | 'cash' | 'credit'; currency: 'ARS' | 'USD' };
const titles = { expense: 'Agregar gasto', plan: 'Nueva compra en cuotas', recurring: 'Agregar recurrente', income: 'Registrar ingreso', account: 'Agregar cuenta', charge: 'Confirmar cargo o pago' };
const FormErrors = createContext<FieldErrors<Values>>({});
function Field({ name, label, children, hint, className = '' }: { name: keyof Values; label: string; children: React.ReactNode; hint?: string; className?: string }) {
  const errors = useContext(FormErrors);
  return <label className={`field ${className}`}>{label}{children}{hint && <span className="field-hint">{hint}</span>}{errors[name] && <span className="field-error">{errors[name]?.message}</span>}</label>;
}

export function ComposerDialog({ composer, onClose }: { composer: Composer; onClose: () => void }) {
  const { data, month, currency, setCurrency, mutate, notify } = useFinance();
  const operationId = useRef(crypto.randomUUID()); const [serverError, setServerError] = useState('');
  const account = composer.type === 'account' ? composer.account : undefined;
  const [customColor, setCustomColor] = useState<string | null>(account?.color ?? null);
  const movement = composer.type === 'expense' ? composer.movement : undefined;
  const editingMovement = movement && !(composer.type === 'expense' && composer.duplicate) ? movement : undefined;
  const rule = composer.type === 'recurring' ? composer.rule : undefined;
  const preset = composer.type === 'recurring' ? composer.preset : undefined;
  const [iconKey, setIconKey] = useState<IconKey>(() => rule ? recurringIconChoice(rule) : preset?.iconKey || 'category');
  const initialCategory = (preset && data.categories.find((c) => c.name === preset.category)?.name) || movement?.category || rule?.category || data.categories.find((c) => c.name === 'General')?.name || data.categories[0]?.name || 'Sin categoría';
  const categoryEmoji = (name: string) => data.categories.find((category) => category.name === name)?.emoji || '🛍️';
  const occurrence = composer.type === 'charge' ? composer.occurrence : undefined;
  const installment = composer.type === 'charge' ? composer.installment : undefined;
  const plan = data.plans.find((p) => p.id === installment?.planId);
  const chargeAccountId = occurrence?.accountId || plan?.accountId;
  const accounts = data.accounts.filter((a) => !a.archived);
  const eligibleAccounts = accounts.filter((a) => a.currency === currency && (composer.type !== 'income' || a.type !== 'credit'));
  const firstAccount = eligibleAccounts.find((a) => a.id === localStorage.getItem('lastAccount')) || eligibleAccounts[0] || accounts.find((a) => a.type !== 'credit') || accounts[0];
  const { register, handleSubmit, watch, setValue, setError, formState: { errors, isSubmitting } } = useForm<Values>({ defaultValues: {
    concept: movement?.concept || rule?.name || preset?.name || '', amount: movement ? moneyInput(movement.amount) : occurrence ? moneyInput(occurrence.amount) : installment ? moneyInput(installment.amount) : rule ? moneyInput(rule.amount) : '',
    accountId: movement?.accountId || rule?.accountId || chargeAccountId || (composer.type === 'income' ? composer.accountId : undefined) || firstAccount?.id || '',
    date: movement?.date || today(), category: initialCategory, emoji: movement?.emoji || rule?.emoji || account?.emoji || categoryEmoji(initialCategory),
    notes: movement?.notes || '', payment: composer.type === 'plan' ? 'installments' : 'single', count: '6', historicalCount: '0', firstDate: today(),
    kind: rule?.kind || preset?.kind || 'subscription', dueDay: String(rule?.dueDay || Number(today().slice(8))), startDate: rule?.startDate || `${month}-01`,
    name: account?.name || '', type: account?.type || 'bank', currency: account?.currency || currency,
  } });
  const values = watch(); const source = accounts.find((a) => a.id === values.accountId);
  const amountCurrency = source?.currency || currency;
  const isPlan = composer.type === 'plan' || composer.type === 'expense' && !movement && values.payment === 'installments';
  function cents(value: string, field: keyof Values, allowNegative = false, allowZero = false) {
    const parsed = parseMoney(value, allowNegative);
    if (parsed === null || !allowZero && parsed <= 0) { setError(field, { message: allowZero ? 'Ingresá un importe válido, con hasta dos decimales.' : 'Ingresá un importe mayor a cero, con hasta dos decimales.' }); throw new Error('Revisá el importe ingresado.'); }
    return parsed;
  }
  async function submit(value: Values) {
    let reconciled = true;
    const save: Mutate = async (...args) => { const outcome = await mutate(...args); reconciled = outcome.reconciled; return outcome; };
    setServerError('');
    try {
      const id = operationId.current;
      if (composer.type === 'account') {
        if (account) await save(`/accounts/${account.id}`, { name: value.name, emoji: value.emoji, color: customColor, archived: account.archived, version: account.version }, 'PATCH');
        else await save('/accounts', accountInputSchema.parse({ id, name: value.name, type: value.type, currency: value.currency, emoji: value.emoji, color: customColor }));
      } else if (composer.type === 'charge') {
        const payload = chargeInputSchema.parse({ id, date: value.date, ...(occurrence ? { amount: cents(value.amount, 'amount') } : {}) });
        await save(occurrence ? `/occurrences/${encodeURIComponent(occurrence.id)}/charge` : `/installments/${installment!.id}/charge`, payload);
      } else if (composer.type === 'income') {
        await save('/incomes', incomeInputSchema.parse({ id, concept: value.concept, accountId: value.accountId, amount: cents(value.amount, 'amount'), date: value.date, notes: value.notes }));
      } else if (composer.type === 'recurring') {
        const payload = recurringInputSchema.parse({ id: rule?.id || id, name: value.concept, kind: value.kind, iconKey, accountId: value.accountId, amount: cents(value.amount, 'amount'), category: value.category, emoji: value.emoji, dueDay: Number(value.dueDay), startDate: value.startDate });
        await save(rule ? `/recurring/${rule.id}` : '/recurring', rule ? { ...payload, active: rule.active, version: rule.version } : payload, rule ? 'PUT' : 'POST');
      } else if (isPlan) {
        await save('/plans', planInputSchema.parse({ id, name: value.concept, accountId: value.accountId, total: cents(value.amount, 'amount'), category: value.category, emoji: value.emoji, count: Number(value.count), firstDate: value.firstDate, historicalCount: Number(value.historicalCount) }));
      } else {
        const payload = expenseInputSchema.parse({ id: editingMovement?.id || id, concept: value.concept, accountId: value.accountId, amount: cents(value.amount, 'amount'), date: value.date, category: value.category, emoji: value.emoji, notes: value.notes });
        await save(editingMovement ? `/expenses/${editingMovement.id}` : '/expenses', editingMovement ? { ...payload, version: editingMovement.version } : payload, editingMovement ? 'PUT' : 'POST');
      }
      if (composer.type === 'recurring' && amountCurrency !== currency) setCurrency(amountCurrency);
      onClose();
      notify(!reconciled ? 'Guardado. No pudimos actualizar las vistas. Volvé a actualizar.' : composer.type === 'plan' || isPlan ? 'Compra creada. Las cuotas quedan pendientes de confirmar.' : composer.type === 'recurring' ? 'Recurrente guardado.' : composer.type === 'account' ? 'Cuenta guardada.' : 'Guardado.');
      if (value.accountId) localStorage.setItem('lastAccount', value.accountId);

    } catch (error) {
      if (error instanceof z.ZodError) { const first = error.issues[0]; const field = first.path[0] as keyof Values; if (field in values) setError(field, { message: first.message }); setServerError(first.message); }
      else setServerError(error instanceof Error ? error.message : 'No pudimos guardar los cambios.');
    }
  }
  const selectAccount = <select {...register('accountId')} required>{accounts.filter((a) => composer.type !== 'income' || a.type !== 'credit').map((a) => <option key={a.id} value={a.id}>{a.name} · {a.currency}{a.type === 'credit' ? ' · Tarjeta' : ''}</option>)}</select>;
  let estimate: number[] = []; try { const amount = parseMoney(values.amount); if (amount) estimate = splitInstallments(amount, Number(values.count)); } catch { /* Importe todavía incompleto. */ }
  const title = editingMovement ? 'Editar gasto' : movement ? 'Duplicar gasto' : rule ? 'Editar recurrente' : account && composer.type === 'account' ? 'Editar cuenta' : composer.type === 'charge' ? source?.type === 'credit' ? 'Registrar cargo' : 'Confirmar pago' : titles[composer.type];
  return <FormErrors.Provider value={errors}><Dialog title={title} description={composer.type === 'charge' ? occurrence?.name || `${plan?.name} · cuota ${installment?.number}/${plan?.count}` : undefined} onClose={() => { if (!isSubmitting) onClose(); }}><form onSubmit={handleSubmit(submit)}><div className="dialog-body form-grid">
    {composer.type === 'account' ? <>
      <Field name="name" label="Nombre de la cuenta" className="span-2"><input {...register('name', { required: 'Escribí un nombre.' })} placeholder="Ej. Galicia o Mercado Pago" maxLength={80} autoFocus /></Field>
      <div className="account-preview span-2"><AccountIcon account={{ name: values.name, type: values.type, color: customColor }} /><span>Logo automático según el nombre de la entidad; si no hay coincidencia, se usa el ícono del tipo de cuenta.</span></div>
      <fieldset className="account-color-field span-2" disabled={isSubmitting}>
        <legend>Color de la cuenta</legend>
        <div className="account-color-controls">
          <label className="account-color-picker"><input type="color" aria-label="Elegir color personalizado" value={customColor ?? accountColor(values.name, values.type)} onChange={(event) => setCustomColor(event.target.value)} /><span>{customColor ? 'Personalizado' : 'Elegir color'}<small>{customColor ?? accountColor(values.name, values.type)}</small></span></label>
          <button type="button" className="btn btn-outline" aria-pressed={customColor === null} onClick={() => setCustomColor(null)}>Automático</button>
        </div>
        <p className="field-hint">{customColor ? 'Este color se conserva aunque cambies el nombre.' : 'El color se adapta al nombre de la entidad o al tipo de cuenta.'}</p>
      </fieldset>
      {!account && <><Field name="type" label="Tipo"><select {...register('type')}><option value="bank">Banco</option><option value="wallet">Billetera virtual</option><option value="cash">Efectivo</option><option value="credit">Tarjeta de crédito</option></select></Field><Field name="currency" label="Moneda"><select {...register('currency')}><option value="ARS">Pesos argentinos · ARS</option><option value="USD">Dólares · USD</option></select></Field><p className="form-note span-2"><Info size={16} />Una cuenta tiene una moneda. Podés agregar otra del mismo banco para tus dólares.</p></>}
    </> : composer.type === 'charge' ? <>
      <Field name="amount" label={`${occurrence ? 'Importe real' : 'Importe de la cuota'} en ${amountCurrency}`} className="span-2"><input {...register('amount')} inputMode="decimal" disabled={!!installment} autoFocus /></Field><Field name="date" label="Fecha efectiva del cargo o débito" className="span-2"><input {...register('date')} type="date" required max={today()} /></Field><p className="form-note span-2">{`Se registra el gasto en ${source?.name || 'la cuenta seleccionada'}. Los consumos con tarjeta se registran al confirmar el cargo; no hace falta registrar el pago del resumen.`}</p>
    </> : <>
      <Field name="concept" label={composer.type === 'recurring' ? 'Nombre del servicio o suscripción' : 'Concepto'} className="span-2"><input {...register('concept', { required: composer.type === 'expense' && !isPlan ? false : 'Escribí un concepto.' })} placeholder={composer.type === 'recurring' ? 'Ej. Internet' : composer.type === 'income' ? 'Ej. Sueldo' : !isPlan ? 'Opcional · Ej. Supermercado' : 'Ej. Supermercado'} maxLength={80} autoFocus /></Field>
      {composer.type === 'expense' && !movement && <div className="field span-2"><span id="payment-label">Forma de compra</span><div className="segmented" role="group" aria-labelledby="payment-label"><button type="button" aria-pressed={values.payment === 'single'} onClick={() => setValue('payment', 'single')}>Pago único</button><button type="button" aria-pressed={values.payment === 'installments'} onClick={() => setValue('payment', 'installments')}>En cuotas</button></div></div>}
      <Field name="accountId" label="Cuenta o tarjeta">{selectAccount}</Field>
      <Field name="amount" label={`${isPlan ? 'Total financiado' : composer.type === 'recurring' ? 'Importe estimado' : 'Importe'} en ${amountCurrency}`}><input {...register('amount')} inputMode="decimal" placeholder="0,00" /></Field>
      {isPlan && <><Field name="count" label="Cantidad de cuotas"><input {...register('count')} type="number" min={2} max={60} required /></Field><Field name="firstDate" label="Fecha de la primera cuota"><input {...register('firstDate')} type="date" required /></Field>{estimate.length > 0 && <p className="form-note span-2">{estimate.length} cuotas de {formatMoney(estimate[0], amountCurrency)}{estimate[0] !== estimate.at(-1) ? `; última de ${formatMoney(estimate.at(-1)!, amountCurrency)}` : ''}. Crear la compra organiza los pagos; cada cuota se registra al confirmarla.</p>}</>}
      {composer.type === 'recurring' && <><Field name="kind" label="Tipo"><select {...register('kind')}><option value="subscription">Suscripción</option><option value="service">Servicio</option></select></Field><Field name="dueDay" label="Día mensual de vencimiento"><input {...register('dueDay')} type="number" min={1} max={31} required /></Field>{!rule && <Field name="startDate" label="Comienza a partir de" className="span-2"><input {...register('startDate')} type="date" required /></Field>}<p className="form-note span-2">{rule ? 'Los cambios se aplican a los meses futuros. Los períodos actuales y anteriores conservan sus datos.' : 'El importe se confirma cada mes. No se registra ningún pago automáticamente.'}</p></>}
      {!isPlan && composer.type !== 'recurring' && <Field name="date" label="Fecha" className="span-2"><input {...register('date')} type="date" required max={today()} /></Field>}
      {['expense', 'plan', 'recurring'].includes(composer.type) && <Field name="category" label="Categoría" className="span-2" hint="Administrá los íconos desde Categorías."><select {...register('category')} onChange={(e) => { setValue('category', e.target.value); setValue('emoji', categoryEmoji(e.target.value)); }}>
        {!data.categories.some((category) => category.name === values.category) && <option value={values.category}>{values.category}</option>}
        {data.categories.map((category) => <option key={category.id} value={category.name}>{category.name}</option>)}
      </select></Field>}
      {['expense', 'plan'].includes(composer.type) && <div className="icon-preview span-2"><CategoryIcon category={data.categories.find((c) => c.name === values.category)} /><span>Ícono de {values.category}</span></div>}
      {composer.type === 'recurring' && <IconPicker value={iconKey} onChange={setIconKey} brands inherited={categoryIcon(data.categories.find((c) => c.name === values.category))} disabled={isSubmitting} />}
      {composer.type !== 'recurring' && <details className="more-options span-2" open={!!movement?.notes}><summary>Más opciones</summary><div className="form-grid">{isPlan && <Field name="historicalCount" label="Cuotas ya pagadas" className="span-2" hint="Para compras ya iniciadas. Se marcan como pagadas anteriormente y no generan nuevos gastos."><input {...register('historicalCount')} type="number" min={0} max={Number(values.count) - 1} /></Field>}{!isPlan && <Field name="notes" label="Nota opcional" className="span-2"><textarea {...register('notes')} maxLength={500} rows={2} placeholder="Algo para recordar…" /></Field>}</div></details>}
    </>}
    {serverError && <p className="form-error span-2" role="alert">{serverError}</p>}
  </div><div className="dialog-actions"><Button type="button" variant="outline" disabled={isSubmitting} onClick={onClose}>Cancelar</Button><Button type="submit" disabled={isSubmitting || composer.type !== 'account' && !accounts.length}>{isSubmitting && <LoaderCircle className="spin" size={17} />}{isSubmitting ? 'Guardando…' : composer.type === 'charge' ? source?.type === 'credit' ? 'Registrar cargo' : 'Confirmar pago' : 'Guardar'}</Button></div></form></Dialog></FormErrors.Provider>;
}
