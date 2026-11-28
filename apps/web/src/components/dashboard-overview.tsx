"use client";

import { useListArrival } from "@/hooks/use-list-arrival";
import { ArrowRightIcon, ChevronLeftIcon, ChevronRightIcon, WalletIcon } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from "@/components/ui/native-select";
import { ExpenseDonutChart, MonthlyFinanceChart } from "./finance-charts";
import { ChartSkeleton, ListSkeleton } from "./workspace-skeleton";
import { visibleTransactions } from "./transaction-list";
import { chartCoordinate, magnitude } from "./finance-chart-data";
import { formatDate, formatCurrencyMinor, formatReportMonth, offsetReportMonth, reportPeriod, type ReportMonth, type ReportRange } from "@/components/finance-format";
import type { CategoryReport } from "@finance/contracts";
import { statementStatusLabel, type References, type ReportData, type TransactionOption } from "@/components/workspace-types";

export type DashboardSeriesPoint = Pick<ReportData, "from" | "to" | "incomeMinorByCurrency" | "expenseMinorByCurrency">;
export type DashboardCategory = CategoryReport;

export type DashboardOverviewProps = {
  referencesLoading?: boolean;
  references: References;
  newTransactionIds?: string[];
  report: ReportData | null;
  reportError: boolean;
  series: DashboardSeriesPoint[];
  categories: DashboardCategory[];
  analyticsLoading: boolean;
  analyticsUnavailable: boolean;
  range: ReportRange;
};

export function DashboardOverview({ referencesLoading = false, newTransactionIds = [], references, report, reportError, series, categories, analyticsLoading, analyticsUnavailable, range }: DashboardOverviewProps) {
  const listRoot = useListArrival(newTransactionIds);
  const balances = Object.entries(report?.balancesByCurrency ?? {});
  const incomes = Object.entries(report?.incomeMinorByCurrency ?? {});
  const expenses = Object.entries(report?.expenseMinorByCurrency ?? {});
  const recent = [...visibleTransactions(references.transactions)].sort((a, b) => b.occurredOn.localeCompare(a.occurredOn)).slice(0, 5);
  const pendingStatements = references.statements
    .map(statement => ({ ...statement, remaining: safeMinor(statement.remainingMinor ?? "0") }))
    .filter(statement => statement.remaining > 0n)
    .sort((a, b) => Number(b.status === "overdue") - Number(a.status === "overdue") || a.dueOn.localeCompare(b.dueOn));
  const statementTotals = new Map<string, bigint>();
  for (const { currency, remaining } of pendingStatements) {
    statementTotals.set(currency, (statementTotals.get(currency) ?? 0n) + remaining);
  }
  const hasCard = references.accounts.some(account => account.type === "credit_card");
  const balanceDate = report?.to ?? reportPeriod(range).to;
  const loading = !report && !reportError;

  return <div ref={listRoot} className="flex flex-col gap-3 pb-6 sm:gap-4">
    <Card size="sm" className="gap-2 px-1">
      <CardHeader><CardTitle><h2>Resumo do período</h2></CardTitle></CardHeader>
      <CardContent className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3 sm:gap-x-4">
        <div className="col-span-2 grid min-w-0 gap-0.5 sm:col-span-1">
          <p className="text-sm text-muted-foreground">Patrimônio em <time dateTime={balanceDate}>{formatDate(balanceDate)}</time></p>
          <SummaryValues loading={loading} values={balances} unavailable={reportError} className="text-xl text-foreground" />
        </div>
        <div className="grid min-w-0 gap-0.5">
          <p className="text-sm text-muted-foreground">Receitas</p>
          <SummaryValues loading={loading} values={incomes} unavailable={reportError} className="text-lg text-primary" />
        </div>
        <div className="grid min-w-0 gap-0.5">
          <p className="text-sm text-muted-foreground">Despesas líquidas</p>
          <SummaryValues loading={loading} values={expenses} unavailable={reportError} className="text-lg text-destructive" />
        </div>
      </CardContent>
    </Card>

    <div className="grid gap-3 sm:gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle><h2>Evolução mensal</h2></CardTitle>
          {series.length > 0 && <p className="text-sm text-muted-foreground">{formatDate(series[0]!.from)} a {formatDate(series[series.length - 1]!.to)}</p>}
        </CardHeader>
        <CardContent className="min-h-64 lg:min-h-72">{analyticsLoading && !series.length ? <ChartSkeleton /> : analyticsUnavailable ? <EmptyPanel text="A evolução mensal não está disponível no momento." /> : <MonthlyBalanceChart series={series} />}</CardContent>
      </Card>
      <Card className="gap-1">
        <CardHeader className="flex flex-wrap items-center justify-between gap-x-3">
          <CardTitle><h2>Gastos por categoria</h2></CardTitle>
          <DashboardLink href="/reports#spending-by-category-BRL">Ver relatório</DashboardLink>
        </CardHeader>
        <CardContent className="@container">
          {analyticsLoading && !categories.length ? <ChartSkeleton donut /> : analyticsUnavailable ? <EmptyPanel text="Os gastos por categoria não estão disponíveis no momento." /> : <CategoryDistribution categories={categories} />}
        </CardContent>
      </Card>
    </div>

    <div className="grid gap-3 sm:gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.65fr)]">
      <Card className="gap-1">
        <CardHeader className="flex flex-wrap items-center justify-between gap-x-3">
          <CardTitle><h2>Faturas a pagar</h2></CardTitle>
          {hasCard && <DashboardLink href="/statements">Ver faturas</DashboardLink>}
        </CardHeader>
        <CardContent className="pb-3">
          {referencesLoading ? <ListSkeleton rows={2} rowClassName="min-h-12" /> : pendingStatements.length ? <ul className="divide-y divide-border">
            {pendingStatements.map(statement => <li key={statement.id} className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
              <div className="min-w-0">
                <p className="break-words text-sm font-medium">{statement.cardAccountName}</p>
                <p className={`text-xs ${statement.status === "overdue" ? "text-destructive" : "text-muted-foreground"}`}>
                  {statement.status === "overdue" ? "Venceu em" : `${statementStatusLabel(statement.status)} · Vence em`} <time dateTime={statement.dueOn}>{formatDate(statement.dueOn)}</time>
                </p>
              </div>
              <span className="break-words font-mono text-sm tabular-nums">{formatCurrencyMinor(statement.remaining.toString(), statement.currency)}</span>
            </li>)}
          </ul> : <p className="text-sm text-muted-foreground">{hasCard ? "Nenhuma fatura pendente." : "Cadastre um cartão para acompanhar suas faturas."}</p>}
        </CardContent>
        {statementTotals.size > 0 && <CardFooter className="mt-auto flex-wrap justify-between gap-x-3 gap-y-1 py-2.5">
          <span className="text-sm font-medium">Total a pagar</span>
          <div className="grid min-w-0 gap-1 text-right font-mono text-base font-medium tabular-nums">
            {[...statementTotals].map(([currency, total]) => <span key={currency} className="break-words">{formatCurrencyMinor(total.toString(), currency)}</span>)}
          </div>
        </CardFooter>}
      </Card>
      <Card className="gap-1">
        <CardHeader className="flex flex-wrap items-center justify-between gap-x-3">
          <CardTitle><h2>Últimas movimentações</h2></CardTitle>
          <DashboardLink href="/entries">Ver todas</DashboardLink>
        </CardHeader>
        <CardContent>
          {referencesLoading ? <ListSkeleton rows={5} rowClassName="min-h-12" /> : recent.length ? <ul className="divide-y divide-border">{recent.map(transaction => <TransactionRow key={transaction.id} isNew={newTransactionIds.includes(transaction.id)} transaction={transaction} />)}</ul> : <EmptyPanel text="Seus lançamentos aparecerão aqui depois de registrados." />}
        </CardContent>
      </Card>
    </div>

    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-x-3">
        <CardTitle><h2>Saldos atuais</h2></CardTitle>
        <DashboardLink href="/accounts">Ver contas</DashboardLink>
      </CardHeader>
      <CardContent>
        {referencesLoading ? <ListSkeleton /> : references.accounts.length ? <ul className="divide-y divide-border">{references.accounts.map(account => <li key={account.id} className="flex min-w-0 items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{account.name}</p><p className="mt-1 text-xs text-muted-foreground">{account.type === "credit_card" ? "Cartão" : "Conta"}</p></div><strong className={`max-w-[48%] break-words text-right font-mono text-xs tabular-nums ${BigInt(account.balanceMinor) < 0n ? "text-destructive" : BigInt(account.balanceMinor) > 0n ? "text-success" : ""}`}>{formatCurrencyMinor(account.balanceMinor, account.currency)}</strong></li>)}</ul> : <EmptyPanel text="Adicione uma conta para acompanhar seus saldos." />}
      </CardContent>
    </Card>
  </div>;
}

function DashboardLink({ href, children }: { href: string; children: string }) {
  return <Link href={href} className="inline-flex min-h-11 w-fit items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline">{children}<ArrowRightIcon aria-hidden="true" className="size-3.5" /></Link>;
}

export function DashboardPeriodSelect({ range, setRange, label = "Período do resumo" }: { range: ReportRange; setRange: (range: ReportRange) => void; label?: string }) {
  const now = new Date();
  const { from, to } = reportPeriod(range, now);
  const currentMonth = reportPeriod("month", now).from;
  const anchor = range === "year" ? currentMonth : from;
  const presets = ["month", "last-month", "year"] as const;
  const periods: ReportRange[] = range === "month" || range === "last-month" || range === "year" ? [...presets] : [range, ...presets];
  const arrowClass = "inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-35 disabled:hover:bg-transparent pointer-fine:size-8";

  function selectMonth(month: ReportMonth) {
    if (month === offsetReportMonth(currentMonth, 0)) setRange("month");
    else if (month === offsetReportMonth(currentMonth, -1)) setRange("last-month");
    else setRange(month);
  }

  return <div role="group" aria-label="Navegação por período" className="flex shrink-0 items-center gap-0.5 rounded-full bg-muted p-0.5">
    <button type="button" aria-label="Mês anterior" className={arrowClass} disabled={anchor <= "0001-01-01"} onClick={() => selectMonth(offsetReportMonth(anchor, -1))}>
      <ChevronLeftIcon className="size-4" aria-hidden="true" />
    </button>
    <NativeSelect className="w-20 min-[360px]:w-24 [&>svg]:hidden [&>select]:rounded-full [&>select]:border-transparent [&>select]:bg-transparent [&>select]:px-1 [&>select]:text-center [&>select]:text-sm [&>select]:font-medium [&>select:hover]:bg-background pointer-fine:[&>select]:min-h-8" aria-label={label} aria-describedby="dashboard-period-dates" value={range} onChange={event => setRange(event.target.value as ReportRange)}>
      {periods.map(value => {
        const period = reportPeriod(value, now);
        const label = value === "year" ? `Ano ${period.from.slice(0, 4)}` : formatReportMonth(period.from);
        return <NativeSelectOptGroup key={value} label={`${formatDate(period.from)} a ${formatDate(period.to)}`}><NativeSelectOption value={value}>{label}</NativeSelectOption></NativeSelectOptGroup>;
      })}
    </NativeSelect>
    <button type="button" aria-label="Próximo mês" className={arrowClass} disabled={anchor >= currentMonth} onClick={() => selectMonth(offsetReportMonth(anchor, 1))}>
      <ChevronRightIcon className="size-4" aria-hidden="true" />
    </button>
    <span id="dashboard-period-dates" aria-live="polite" className="sr-only"><time dateTime={from}>{formatDate(from)}</time> a <time dateTime={to}>{formatDate(to)}</time></span>
  </div>;
}

function MonthlyBalanceChart({ series }: { series: DashboardSeriesPoint[] }) {
  const currencies = [...new Set(series.flatMap(point => [...Object.keys(point.incomeMinorByCurrency), ...Object.keys(point.expenseMinorByCurrency)]))].sort();
  if (!series.length || !currencies.length) return <EmptyPanel text="Não há comparativo mensal disponível." />;

  return <div className="grid gap-5">
    {currencies.map(currency => {
      return <section key={currency} aria-label={`Evolução mensal em ${currency}`} className="min-w-0">
        {currencies.length > 1 && <p className="mb-2 font-mono text-xs text-muted-foreground">{currency}</p>}
        <MonthlyFinanceChart series={series} currency={currency} variant="line" />
      </section>;
    })}
    {series.some(point => Object.values(point.expenseMinorByCurrency).some(amount => safeMinor(amount) < 0n)) && <p className="text-xs text-muted-foreground">Reembolsos podem deixar despesas negativas.</p>}
  </div>;
}

const categoryColors = [
  "var(--chart-2)", "var(--chart-income)", "var(--chart-3)", "var(--chart-expense)", "var(--chart-4)",
  "#a78bfa", "#f472b6", "#a3e635", "#fb923c", "#38bdf8",
];
const categoryPercentage = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 2 });

function CategoryDistribution({ categories }: { categories: DashboardCategory[] }) {
  const expenses = categories.map(item => ({ ...item, amount: safeMinor(item.expenseMinor) })).filter(item => item.amount !== 0n);
  const currencies = [...new Set(expenses.map(item => item.currency))].sort();
  if (!currencies.length) return <EmptyPanel text="Não há despesas por categoria neste período." />;

  return <div className="grid gap-4">
    {currencies.map(currency => {
      const rows = expenses.filter(item => item.currency === currency)
        .sort((a, b) => magnitude(a.amount) === magnitude(b.amount) ? 0 : magnitude(a.amount) > magnitude(b.amount) ? -1 : 1);
      const total = rows.reduce((sum, item) => sum + magnitude(item.amount), 0n);
      const segments = rows.map((item, index) => ({
        label: item.categoryName ?? "Sem categoria",
        amountMinor: item.expenseMinor,
        fill: categoryColors[index % categoryColors.length]!,
      }));

      return <section key={currency} aria-label={`Gastos por categoria em ${currency}`}>
        {currencies.length > 1 && <p className="mb-2 text-xs text-muted-foreground">{currency}</p>}
        <div className="grid items-center gap-2 @min-[22rem]:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <ExpenseDonutChart currency={currency} rows={segments} totalLabel="Total líquido" compact />
          <ul className="divide-y divide-border">
            {rows.map((item, index) => <li key={item.categoryId ?? "uncategorized"} className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 py-1.5 text-xs">
              <span className="flex min-w-0 items-baseline gap-1.5"><span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ backgroundColor: segments[index]!.fill }} /><span className="min-w-0 break-words">{segments[index]!.label}</span></span>
              <span className="ml-auto flex min-w-0 flex-wrap justify-end gap-x-2 text-right font-mono tabular-nums">
                <span className={item.amount < 0n ? "text-success" : "text-muted-foreground"}>{formatCurrencyMinor(item.expenseMinor, currency)}</span>
                <span>{categoryPercentage.format(chartCoordinate(magnitude(item.amount), total) / 100)}</span>
              </span>
            </li>)}
          </ul>
        </div>
        {rows.some(item => item.amount < 0n) && <p className="mt-2 text-xs text-muted-foreground">Os percentuais usam valores absolutos quando há categorias com saldo negativo por reembolsos.</p>}
      </section>;
    })}
  </div>;
}

function safeMinor(value: string) {
  try { return BigInt(value); } catch { return 0n; }
}

function SummaryValues({ values, unavailable, className, loading }: { loading: boolean; values: [string, string][]; unavailable: boolean; className: string }) {
  if (loading) return <div role="status" className={className}><span className="sr-only">Carregando indicador</span><Skeleton aria-hidden="true" className="h-[1lh] w-3/4" /></div>;
  if (unavailable) return <p className={`${className} text-muted-foreground`}>—<span className="sr-only">Indisponível</span></p>;
  if (!values.length) return <p className={`${className} text-muted-foreground`}>—<span className="sr-only">Sem movimentações</span></p>;
  return <div className="grid min-w-0 gap-1">{values.map(([currency, amount]) => <p key={currency} className={`[overflow-wrap:anywhere] font-mono font-medium tracking-tight tabular-nums ${className}`}>{formatCurrencyMinor(amount, currency)}</p>)}</div>;
}

function TransactionRow({ transaction, isNew }: { transaction: TransactionOption; isNew: boolean }) {
  const isIncome = transaction.kind === "income";
  const amounts = transaction.entries?.map(entry => formatCurrencyMinor(entry.amountMinor, entry.currency)).join(" · ") ?? "";
  const kind = transaction.kind === "income" ? "Receita" : transaction.kind === "expense" ? "Despesa" : transaction.kind === "transfer" ? "Transferência" : transaction.kind === "refund" ? "Estorno" : transaction.kind;
  return <li data-transaction-id={transaction.id} className={`flex min-w-0 items-center justify-between gap-3 py-2 ${isNew ? "new-transaction" : ""}`}>
    <div className="flex min-w-0 items-center gap-3"><span className={`flex size-9 shrink-0 items-center justify-center rounded-full bg-muted ${isIncome ? "text-primary" : "text-muted-foreground"}`}><WalletIcon aria-hidden="true" className="size-4" /></span><div className="min-w-0"><p className="truncate text-sm font-medium">{transaction.description}</p><p className="mt-1 truncate text-[11px] text-muted-foreground">{formatDate(transaction.occurredOn)} · {kind}</p></div></div>
    {amounts && <span className={`max-w-[44%] break-words text-right font-mono text-xs tabular-nums ${isIncome ? "text-primary" : transaction.kind === "expense" ? "text-destructive" : "text-foreground"}`}>{amounts}</span>}
  </li>;
}

function EmptyPanel({ text }: { text: string }) {
  return <Empty className="min-h-28 gap-2 p-4"><EmptyDescription>{text}</EmptyDescription></Empty>;
}
