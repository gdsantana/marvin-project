import type { AccountWithBalance, CategoryResponse, InstitutionResponse, MonthlySummary, StatementDetail, TransactionResponse } from "@finance/contracts";
export type Section = "overview" | "new" | "accounts" | "cards" | "entries" | "statements" | "reports";
export type Action = "institution" | "account" | "configureCard" | "category" | "income" | "expense" | "transfer" | "purchase" | "cashback" | "refund" | "payment" | "close" | "forecast" | "realizeForecast" | "cancelForecast" | "correct" | "reverse";
export type AccountOption = Pick<AccountWithBalance, "id" | "name" | "type" | "currency" | "balanceMinor"> & Partial<Pick<AccountWithBalance, "availableCreditMinor">>;
export type CategoryOption = Pick<CategoryResponse, "id" | "name" | "type" | "isArchived">;
export type TransactionOption = Pick<TransactionResponse, "id" | "description" | "kind" | "occurredOn"> & Partial<Omit<TransactionResponse, "id" | "description" | "kind" | "occurredOn">>;
export type ExpenseForecastOption = import("@finance/contracts").CreateExpenseForecastInput & { id: string; currency: string; status: "projected" | "realized" | "cancelled"; realizedTransactionId: string | null; createdAt: string };
export type StatementOption = Pick<StatementDetail, "id" | "cardAccountId" | "cardAccountName" | "currency" | "dueOn" | "status"> & Partial<Pick<StatementDetail, "remainingMinor" | "items" | "creditBalanceMinor">>;
export type References = { accounts: AccountOption[]; categories: CategoryOption[]; transactions: TransactionOption[]; statements: StatementOption[]; institutions: Pick<InstitutionResponse, "id" | "name">[] };
export type ReportData = MonthlySummary;

export const actionLabels: Record<Action, string> = {
  institution: "Nova instituição", account: "Nova conta ou cartão", configureCard: "Configurar cartão", category: "Nova categoria", income: "Registrar receita", expense: "Registrar despesa", transfer: "Transferir entre contas", purchase: "Compra parcelada", cashback: "Registrar cashback", refund: "Registrar reembolso", payment: "Pagar fatura", close: "Fechar fatura", forecast: "Nova previsão de despesa", realizeForecast: "Realizar previsão", cancelForecast: "Cancelar previsão", correct: "Corrigir lançamento", reverse: "Cancelar lançamento",
};
export const primaryActions: Action[] = ["institution", "account", "configureCard", "category", "income", "expense", "transfer", "purchase", "cashback", "refund", "payment", "close", "forecast"];

