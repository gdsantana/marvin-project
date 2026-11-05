"use client";

import { ArrowRightIcon, LandmarkIcon, PlusIcon, WalletIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { MonthlyFinanceChart, ExpenseDonutChart } from "./finance-charts";
import { visibleTransactions } from "./transaction-list";
import { formatDate, formatMinor } from "@/components/finance-format";
import type { CategoryReport } from "@finance/contracts";
import type { Action, References, ReportData, TransactionOption } from "@/components/workspace-types";

export type DashboardSeriesPoint = Pick<ReportData, "from" | "to" | "incomeMinorByCurrency" | "expenseMinorByCurrency">;
export type DashboardCategory = CategoryReport;

export type DashboardOverviewProps = {
  references: References;
  report: ReportData | null;
  reportError: boolean;
  series: DashboardSeriesPoint[];
  categories: DashboardCategory[];
  analyticsLoading: boolean;
  range: string;
  setRange: (range: string) => void;
  setForm: (action: Action) => void;
};

const periodLabels: Record<string, string> = { month: "Este mês", "last-month": "Mês passado", year: "Este ano" };
export function DashboardOverview({ references, report, reportError, series, categories, analyticsLoading, range, setRange, setForm }: DashboardOverviewProps) {
  const balances = Object.entries(report?.balancesByCurrency ?? {});
  const incomes = Object.entries(report?.incomeMinorByCurrency ?? {});
  const expenses = Object.entries(report?.expenseMinorByCurrency ?? {});
  const recent = [...visibleTransactions(references.transactions)].sort((a, b) => b.occurredOn.localeCompare(a.occurredOn)).slice(0, 5);

  return <div className="flex flex-col gap-4 pb-6 sm:gap-6">
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2.1fr)_minmax(240px,1fr)] lg:gap-6">
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-5">
        <CardTitle><h2 className="text-sm text-muted-foreground">Patrimônio líquido</h2></CardTitle>
        <PeriodSelect range={range} setRange={setRange} />
      </CardHeader>
      <CardContent className="grid gap-2 px-4 sm:px-5">
        <SummaryValues values={balances} unavailable={reportError} className="text-3xl text-foreground sm:text-4xl" />
        <p className="text-xs text-muted-foreground">Saldo até o fim do período</p>
      </CardContent>
    </Card>
    <Card className="hidden lg:flex">
      <CardContent className="flex h-full flex-col justify-between gap-3 px-5">
        <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground"><span>Contas registradas</span><LandmarkIcon aria-hidden="true" className="size-4" /></div>
        <p className="font-mono text-3xl tabular-nums">{references.accounts.filter(account => account.type !== "credit_card").length}</p>
        <Link href="/accounts" className="inline-flex min-h-11 items-center text-xs text-primary">Ver contas</Link>
      </CardContent>
    </Card>
    </div>

    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2.1fr)_minmax(240px,1fr)] lg:gap-6">
      <Card>
        <CardHeader className="px-4 pb-0 sm:px-5">
          <CardTitle><h2 className="text-lg tracking-tight">Balanço mensal</h2></CardTitle>
          <CardDescription>{periodLabels[range] ?? "Período selecionado"}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 px-4 sm:px-5">
          <div className="grid grid-cols-2 gap-4 border-b border-border pb-4">
            <div className="grid min-w-0 content-start gap-2">
              <p className="flex items-center gap-2 text-xs text-muted-foreground"><span aria-hidden="true" className="size-2 rounded-full bg-chart-income" />Receitas</p>
              <SummaryValues values={incomes} unavailable={reportError} className="text-base text-primary sm:text-xl" />
            </div>
            <div className="grid min-w-0 content-start gap-2">
              <p className="flex items-center gap-2 text-xs text-muted-foreground"><span aria-hidden="true" className="size-2 rounded-full bg-chart-expense" />Despesas</p>
              <SummaryValues values={expenses} unavailable={reportError} className="text-base text-destructive sm:text-xl" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Evolução dos últimos {range === "year" ? "12" : "seis"} meses</p>
          {analyticsLoading && !series.length ? <p role="status" className="py-8 text-center text-sm text-muted-foreground">Carregando balanço mensal…</p> : reportError ? <EmptyPanel text="O balanço não está disponível no momento." /> : <MonthlyBalanceChart series={series} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="px-4 pb-2 sm:px-5"><CardTitle><h2 className="text-xl tracking-tight lg:text-base">Distribuição</h2></CardTitle><CardDescription>Por categoria no período</CardDescription></CardHeader>
        <CardContent className="px-4 pb-4 sm:px-5">
          {analyticsLoading && !categories.length ? <p role="status" className="py-8 text-center text-sm text-muted-foreground">Carregando distribuição…</p> : reportError ? <EmptyPanel text="A distribuição não está disponível no momento." /> : <CategoryDistribution categories={categories} />}
        </CardContent>
      </Card>
    </div>

    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2.1fr)_minmax(240px,1fr)] lg:gap-6">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 px-4 pb-1 sm:px-5">
          <div><CardTitle><h2 className="text-xl tracking-tight lg:text-base">Últimas movimentações</h2></CardTitle><CardDescription>Atividade registrada</CardDescription></div>
          <Link href="/entries" className="inline-flex min-h-11 shrink-0 items-center gap-1 text-xs font-medium text-primary">Ver todas <ArrowRightIcon aria-hidden="true" className="size-3.5" /></Link>
        </CardHeader>
        <CardContent className="px-4 pb-2 sm:px-5">
          {recent.length ? <ul className="flex flex-col gap-1.5">{recent.map(transaction => <TransactionRow key={transaction.id} transaction={transaction} />)}</ul> : <EmptyPanel text="Seus lançamentos aparecerão aqui depois de registrados." />}
        </CardContent>
      </Card>
      <Card className="hidden lg:flex">
        <CardHeader className="px-5 pb-1"><CardTitle><h2 className="text-base">Contas</h2></CardTitle><CardDescription>Saldos por conta e moeda</CardDescription></CardHeader>
        <CardContent className="px-5 pb-4">
          {references.accounts.length ? <ul className="divide-y divide-border">{references.accounts.slice(0, 5).map(account => <li key={account.id} className="flex min-w-0 items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{account.name}</p><p className="mt-1 text-xs text-muted-foreground">{account.type === "credit_card" ? "Cartão" : "Conta"} · {account.currency}</p></div><strong className="max-w-[48%] break-words text-right font-mono text-xs tabular-nums">{formatMinor(account.balanceMinor, account.currency)}</strong></li>)}</ul> : <EmptyPanel text="Adicione uma conta para acompanhar seus saldos." />}
        </CardContent>
      </Card>
    </div>

    <Card>
      <CardHeader><CardTitle><h2>Próximas faturas</h2></CardTitle><CardDescription>Parcelas e pagamentos</CardDescription></CardHeader>
      <CardContent>{references.statements.filter(statement => BigInt(statement.remainingMinor ?? "0") > 0n).length ? <ul className="divide-y divide-border">{references.statements.filter(statement => BigInt(statement.remainingMinor ?? "0") > 0n).slice(0, 4).map(statement => <li key={statement.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><span>{statement.cardAccountName} · vence em {formatDate(statement.dueOn)}</span><span className="font-mono tabular-nums">{statement.remainingMinor ? formatMinor(statement.remainingMinor, statement.currency) : ""}</span></li>)}</ul> : <EmptyPanel text="Cadastre um cartão para acompanhar suas faturas." />}<Link href="/statements" className="inline-flex min-h-11 items-center text-sm text-primary">Ver faturas</Link></CardContent>
    </Card>

    <div className="grid grid-cols-2 gap-3 lg:hidden">
      <QuickAction label="Registrar receita" onClick={() => setForm("income")} />
      <Link href="/statements" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border text-sm">Ver faturas</Link>
    </div>
  </div>;
}

function PeriodSelect({ range, setRange }: { range: string; setRange: (range: string) => void }) {
  return <NativeSelect aria-label="Período do resumo" value={range} onChange={event => setRange(event.target.value)}><NativeSelectOption value="month">Este mês</NativeSelectOption><NativeSelectOption value="last-month">Mês passado</NativeSelectOption><NativeSelectOption value="year">Este ano</NativeSelectOption></NativeSelect>;
}

function MonthlyBalanceChart({ series }: { series: DashboardSeriesPoint[] }) {
  const currencies = [...new Set(series.flatMap(point => [...Object.keys(point.incomeMinorByCurrency), ...Object.keys(point.expenseMinorByCurrency)]))].sort();
  if (!series.length || !currencies.length) return <EmptyPanel text="Não há comparativo mensal disponível." />;

  return <div className="grid gap-5">
    {currencies.map(currency => {
      return <section key={currency} aria-label={`Balanço mensal em ${currency}`} className="min-w-0">
        {currencies.length > 1 && <p className="mb-2 font-mono text-xs text-muted-foreground">{currency}</p>}
        <MonthlyFinanceChart series={series} currency={currency} />
      </section>;
    })}
    {series.some(point => Object.values(point.expenseMinorByCurrency).some(amount => safeMinor(amount) < 0n)) && <p className="text-xs text-muted-foreground">Reembolsos podem deixar despesas negativas.</p>}
  </div>;
}

const categoryColors = ["var(--chart-income)", "var(--chart-2)", "var(--chart-expense)", "var(--chart-3)", "var(--chart-4)"];

function CategoryDistribution({ categories }: { categories: DashboardCategory[] }) {
  const currencies = [...new Set(categories.filter(item => safeMinor(item.expenseMinor) !== 0n).map(item => item.currency))].sort();
  if (!currencies.length) return <EmptyPanel text="Não há despesas por categoria disponíveis." />;
  return <div className="grid gap-5">
    {currencies.map(currency => {
      const rows = categories.filter(item => item.currency === currency && safeMinor(item.expenseMinor) !== 0n).sort((left, right) => {
        const a = abs(safeMinor(left.expenseMinor)), b = abs(safeMinor(right.expenseMinor));
        return a > b ? -1 : a < b ? 1 : 0;
      });
      const totalMagnitude = rows.reduce((sum, item) => sum + abs(safeMinor(item.expenseMinor)), 0n);
      return <section key={currency} aria-label={`Despesas por categoria em ${currency}`} className="min-w-0">
        {currencies.length > 1 && <p className="mb-2 font-mono text-xs text-muted-foreground">{currency}</p>}
        <ExpenseDonutChart currency={currency} rows={rows.map((item, index) => ({ label: item.categoryName ?? "Sem categoria", amountMinor: item.expenseMinor, fill: categoryColors[index % categoryColors.length]! }))} />
        <ul className="grid gap-3">
          {rows.map((item, index) => {
            const amount = safeMinor(item.expenseMinor);
            const share = totalMagnitude > 0n ? Number((abs(amount) * 10000n) / totalMagnitude) / 100 : 0;
            return <li key={`${item.categoryId ?? "uncategorized"}-${index}`} className="grid min-w-0 gap-1.5">
              <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="min-w-0 break-words text-xs">{item.categoryName ?? "Sem categoria"}</span>
                <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{share}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${share}%`, backgroundColor: categoryColors[index % categoryColors.length] }} /></div>
              <strong className={`break-words text-right font-mono text-xs tabular-nums ${amount < 0n ? "text-success" : "text-foreground"}`}>{formatMinor(amount.toString(), currency)}</strong>
            </li>;
          })}
        </ul>
      </section>;
    })}
    <p className="text-xs text-muted-foreground">Valores assinados por moeda. Os percentuais usam a soma dos valores absolutos; reembolsos podem deixar despesas negativas.</p>
  </div>;
}

function safeMinor(value: string) {
  try { return BigInt(value); } catch { return 0n; }
}

function abs(value: bigint) { return value < 0n ? -value : value; }

function SummaryValues({ values, unavailable, className }: { values: [string, string][]; unavailable: boolean; className: string }) {
  if (unavailable) return <p className="text-sm text-muted-foreground">Indisponível</p>;
  if (!values.length) return <p className="text-sm text-muted-foreground">Sem movimentações</p>;
  return <div className="grid min-w-0 gap-1">{values.map(([currency, amount]) => <p key={currency} className={`[overflow-wrap:anywhere] font-mono font-medium tracking-tight tabular-nums ${className}`}>{formatMinor(amount, currency)}</p>)}</div>;
}

function TransactionRow({ transaction }: { transaction: TransactionOption }) {
  const isIncome = transaction.kind === "income";
  const amounts = transaction.entries?.map(entry => formatMinor(entry.amountMinor, entry.currency)).join(" · ") ?? "";
  const kind = transaction.kind === "income" ? "Receita" : transaction.kind === "expense" ? "Despesa" : transaction.kind === "transfer" ? "Transferência" : transaction.kind === "refund" ? "Estorno" : transaction.kind;
  return <li className="flex min-w-0 items-center justify-between gap-3 rounded-lg bg-surface p-2 lg:bg-transparent lg:py-4">
    <div className="flex min-w-0 items-center gap-3"><span className={`flex size-9 shrink-0 items-center justify-center rounded-full bg-muted ${isIncome ? "text-primary" : "text-muted-foreground"}`}><WalletIcon aria-hidden="true" className="size-4" /></span><div className="min-w-0"><p className="truncate text-sm font-medium">{transaction.description}</p><p className="mt-1 truncate text-[11px] text-muted-foreground">{formatDate(transaction.occurredOn)} · {kind}</p></div></div>
    {amounts && <span className={`max-w-[44%] break-words text-right font-mono text-xs tabular-nums ${isIncome ? "text-primary" : transaction.kind === "expense" ? "text-destructive" : "text-foreground"}`}>{amounts}</span>}
  </li>;
}

function QuickAction({ label, onClick }: { label: string; onClick: () => void }) {
  return <Button variant="outline" className="w-full" onClick={onClick}><PlusIcon data-icon="inline-start" />{label}</Button>;
}

function EmptyPanel({ text }: { text: string }) {
  return <Empty className="min-h-28 gap-2 p-4"><EmptyDescription>{text}</EmptyDescription></Empty>;
}
