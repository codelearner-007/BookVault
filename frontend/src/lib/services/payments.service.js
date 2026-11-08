import { cashTransactionsService } from './cash-transactions.service';

export const paymentsService = cashTransactionsService('payments');
