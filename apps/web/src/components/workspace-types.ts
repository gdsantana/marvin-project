import type { AccountWithBalance, CategoryResponse, InstitutionResponse, MonthlySummary, StatementDetail, TransactionResponse } from "@finance/contracts";
export type Section = "settings" | "overview" | "new" | "accounts" | "cards" | "entries" | "statements" | "reports";
export type Action = "institution" | "account" | "correctOpeningBalance" | "allocateOpeningDebt" | "configureCard" | "category" | "income" | "expense" | "transfer" | "purchase" | "cashback" | "refund" | "payment" | "statementAdjustment" | "close" | "forecast" | "realizeForecast" | "cancelForecast" | "correct" | "reverse";
export type AccountOption = Pick<AccountWithBalance, "id" | "name" | "type" | "currency" | "balanceMinor"> & Partial<Pick<AccountWithBalance, "availableCreditMinor" | "openingBalanceMinor" | "isArchived" | "hasUnallocatedOpeningDebt">>;
export type CategoryOption = Pick<CategoryResponse, "id" | "name" | "type" | "isArchived"> & Partial<Pick<CategoryResponse, "parentId">>;
export type TransactionOption = Pick<TransactionResponse, "id" | "description" | "kind" | "occurredOn"> & Partial<Omit<TransactionResponse, "id" | "description" | "kind" | "occurredOn">>;
export type ExpenseForecastOption = import("@finance/contracts").CreateExpenseForecastInput & { id: string; currency: string; status: "projected" | "realized" | "cancelled"; realizedTransactionId: string | null; createdAt: string };
export type StatementOption = Pick<StatementDetail, "id" | "cardAccountId" | "cardAccountName" | "currency" | "dueOn" | "status"> & Partial<Pick<StatementDetail, "closingOn" | "remainingMinor" | "billedMinor" | "paidMinor" | "items" | "creditBalanceMinor" | "openingDebtMinor">>;
export type References = { accounts: AccountOption[]; categories: CategoryOption[]; transactions: TransactionOption[]; statements: StatementOption[]; institutions: Pick<InstitutionResponse, "id" | "name">[] };
export type ReportData = MonthlySummary;

export function openingDebtMoveTargets(statements: StatementOption[], source: StatementOption) {
  return statements.filter(statement => statement.cardAccountId === source.cardAccountId && statement.status === "open"
    && source.closingOn && statement.closingOn && statement.closingOn < source.closingOn && statement.items?.length);
}

export function openingDebtCards({ accounts, statements }: References) {
  return accounts.filter(account => account.hasUnallocatedOpeningDebt || (account.type === "credit_card" && !account.isArchived
    && statements.some(source => source.cardAccountId === account.id && source.status === "open"
      && source.openingDebtMinor && source.items?.length === 0 && openingDebtMoveTargets(statements, source).length > 0)));
}

export const actionLabels: Record<Action, string> = {
  allocateOpeningDebt: "Vincular dívida inicial",
  correctOpeningBalance: "Corrigir saldo inicial", institution: "Nova instituição", account: "Nova conta ou cartão", configureCard: "Configurar cartão", category: "Nova categoria", income: "Registrar receita", expense: "Registrar despesa", transfer: "Transferir entre contas", purchase: "Compra no cartão de crédito", cashback: "Registrar cashback", refund: "Registrar reembolso", statementAdjustment: "Ajustar fatura", payment: "Pagar fatura", close: "Fechar fatura", forecast: "Nova previsão de despesa", realizeForecast: "Realizar previsão", cancelForecast: "Cancelar previsão", correct: "Corrigir lançamento", reverse: "Cancelar lançamento",
};
export const primaryActions: Action[] = ["income", "expense", "transfer", "purchase", "cashback", "refund", "payment", "statementAdjustment", "close", "forecast"];


export const settingsActions: Action[] = ["institution", "account", "correctOpeningBalance", "allocateOpeningDebt", "configureCard", "category"];
