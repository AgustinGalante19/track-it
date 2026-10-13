import * as service from './service';
import * as categories from './categories';
import type { Database } from './db/client';
import { getSyncMonth, synchronize, type SyncOperation } from './finance-sync';
export { DomainError, getSnapshot, accountHistory } from './service';
type Executor = Parameters<Parameters<Database['transaction']>[0]>[0];
function wrap<A extends unknown[], T>(operation: SyncOperation,
  legacy: (db: Database, userId: string, ...args: A) => Promise<T>,
  internal: (tx: Executor, userId: string, ...args: A) => Promise<T>) {
  return (db: Database, userId: string, ...args: A) => {
    const month = getSyncMonth();
    return month === undefined ? legacy(db, userId, ...args)
      : synchronize(db, userId, operation, args, month, (tx) => internal(tx, userId, ...args));
  };
}
export const createAccount = wrap('createAccount', service.createAccount, service.createAccountInTransaction);
export const editAccount = wrap('editAccount', service.editAccount, service.editAccountInTransaction);
export const deleteAccount = wrap('deleteAccount', service.deleteAccount, service.deleteAccountInTransaction);
export const createExpense = wrap('createExpense', service.createExpense, service.createExpenseInTransaction);
export const editExpense = wrap('editExpense', service.editExpense, service.editExpenseInTransaction);
export const createIncome = wrap('createIncome', service.createIncome, service.createIncomeInTransaction);
export const voidMovement = wrap('voidMovement', service.voidMovement, service.voidMovementInTransaction);
export const createRecurring = wrap('createRecurring', service.createRecurring, service.createRecurringInTransaction);
export const updateRecurring = wrap('updateRecurring', service.updateRecurring, service.updateRecurringInTransaction);
export const deleteRecurring = wrap('deleteRecurring', service.deleteRecurring, service.deleteRecurringInTransaction);
export const chargeOccurrence = wrap('chargeOccurrence', service.chargeOccurrence, service.chargeOccurrenceInTransaction);
export const skipOccurrence = wrap('skipOccurrence', service.skipOccurrence, service.skipOccurrenceInTransaction);
export const createPlan = wrap('createPlan', service.createPlan, service.createPlanInTransaction);
export const chargeInstallment = wrap('chargeInstallment', service.chargeInstallment, service.chargeInstallmentInTransaction);
export const cancelPlan = wrap('cancelPlan', service.cancelPlan, service.cancelPlanInTransaction);
export const createCategory = wrap('createCategory', categories.createCategory, categories.createCategoryInTransaction);
export const editCategory = wrap('editCategory', categories.editCategory, categories.editCategoryInTransaction);
export const deleteCategory = wrap('deleteCategory', categories.deleteCategory, categories.deleteCategoryInTransaction);
