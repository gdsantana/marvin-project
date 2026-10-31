"use client";

import { ArrowDownLeftIcon, ArrowUpRightIcon, CalendarDaysIcon, ChartNoAxesCombinedIcon, WalletIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MonthlyFinanceChart, AmountFinanceChart } from "./finance-charts";
import type { CategoryReport, MonthlySummary } from "@finance/contracts";
import { formatDate, formatMinor, percentChangeBasisPoints } from "./finance-format";

export type ReportRange = "month" | "last-month" | "year";
export type ReportsSummary = MonthlySummary;
export type ReportSeriesPoint = Pick<MonthlySummary, "from" | "to" | "incomeMinorByCurrency" | "expenseMinorByCurrency">;
export type ReportCategory = CategoryReport;

export type ReportsDashboardProps = {
  range: ReportRange;
  onRangeChange: (range: ReportRange) => void;
  report: ReportsSummary | null;
  series: ReportSeriesPoint[];
  categories: ReportCategory[];
  analyticsLoading: boolean;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
};

const rangeLabels: Record<ReportRange, string> = { month: "Este mês", "last-month": "Mês passado", year: "Este ano" };

export function ReportsDashboard({ range, onRangeChange, report, series, categories, analyticsLoading, loading = false, error, onRetry }: ReportsDashboardProps) {
  const currencies = [...new Set([
    ...Object.keys(report?.incomeMinorByCurrency ?? {}),
    ...Object.keys(report?.expenseMinorByCurrency ?? {}),
  ])].sort();

  return <div className="grid gap-4 lg:gap-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div role="group" aria-label="Intervalo do relatório" className="inline-flex max-w-full rounded-lg bg-muted p-1">
        {(Object.keys(rangeLabels) as ReportRange[]).map(option => <Button key={option} size="sm" variant={range === option ? "secondary" : "ghost"} aria-pressed={range === option} onClick={() => onRangeChange(option)}>{rangeLabels[option]}</Button>)}
      </div>
      <div className="flex min-h-11 items-center gap-2 self-start rounded-lg border border-border bg-card px-3 text-sm text-muted-foreground sm:self-auto">
        <CalendarDaysIcon className="size-4" aria-hidden="true" />
        <span>{report ? `${formatDate(report.from)} – ${formatDate(report.to)}` : "Período selecionado"}</span>
      </div>
    </div>

    {error ? <Card><CardContent className="flex flex-wrap items-center justify-between gap-3 p-4"><p role="alert" className="text-sm text-destructive">{error}</p>{onRetry && <Button variant="outline" onClick={onRetry}>Tentar novamente</Button>}</CardContent></Card> : null}
    {loading && <p role="status" className="text-sm text-muted-foreground">{report ? "Atualizando relatório…" : "Carregando relatório…"}</p>}
    {!report && !error ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">{[0, 1, 2].map(item => <div key={item} className="h-32 animate-pulse rounded-xl bg-card" />)}</div> : null}

    {report && !error && <>
      {currencies.length === 0 ? <Card><CardContent className="p-5 text-sm text-muted-foreground">Não há movimentações classificadas neste período.</CardContent></Card> : currencies.map(currency => {
        const income = BigInt(report.incomeMinorByCurrency[currency] ?? "0");
        const expense = BigInt(report.expenseMinorByCurrency[currency] ?? "0");
        const net = income - expense;
        const savingRate = income > 0n ? (net * 10000n) / income : null;
        const days = periodDays(report.from, report.to);
        const dailySpend = expense < 0n ? -((-expense + BigInt(days) / 2n) / BigInt(days)) : (expense + BigInt(days) / 2n) / BigInt(days);

        return <section key={currency} aria-labelledby={`report-${currency}`} className="grid gap-4 lg:gap-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <MetricCard label="Taxa de poupança" value={savingRate === null ? "—" : `${formatPercent(savingRate)}%`} detail={savingRate === null ? "Sem receitas no período" : "Resultado ÷ receitas"} icon="saving" />
            <MetricCard label="Gasto médio por dia" value={formatMinor(dailySpend.toString(), currency)} detail={`${days} dias no período · ${currency}`} icon="spend" />
            <MetricCard label="Resultado do período" value={formatMinor(net.toString(), currency)} detail={`Receitas menos despesas · ${currency}`} icon="net" />
          </div>

          <Card><CardContent className="p-4 text-sm text-muted-foreground"><p className="font-medium text-foreground">Resumo do período</p><p className="mt-1">{net > 0n ? "As receitas superaram as despesas em " : net < 0n ? "As despesas superaram as receitas em " : "Receitas e despesas ficaram iguais em "}<strong className="font-mono text-foreground">{formatMinor((net < 0n ? -net : net).toString(), currency)}</strong>.</p></CardContent></Card>

          {series.length >= 2 && <PeriodComparison currency={currency} previous={series[series.length - 2]!} current={series[series.length - 1]!} />}
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(15rem,1fr)] lg:gap-5">
            <MonthlySeries currency={currency} series={series} />
            <CategoryBreakdown currency={currency} categories={categories} loading={analyticsLoading} />
          </div>

          <Card>
            <CardContent className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,.8fr)] lg:items-center lg:gap-8">
              <div>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><p className="font-mono text-[10px] tracking-[.14em] text-muted-foreground">TOTAIS DO PERÍODO</p><h2 id={`report-${currency}`} className="mt-1 text-lg font-medium">Receitas e despesas <span className="font-mono text-xs text-muted-foreground">{currency}</span></h2></div>
                  <div className="flex gap-3 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full bg-success" />Receitas</span><span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full bg-destructive" />Despesas</span></div>
                </div>
                <AmountFinanceChart currency={currency} rows={[{ label: "Receitas", amountMinor: income.toString(), fill: "var(--chart-income)" }, { label: "Despesas", amountMinor: expense.toString(), fill: "var(--chart-expense)" }]} />
                <p className="mt-4 text-xs text-muted-foreground">Totais do período selecionado. Cada moeda é apresentada separadamente, sem conversão.</p>
              </div>
              <div className="grid grid-cols-2 gap-3 border-t border-border pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                <Summary label="Receitas" amount={income.toString()} currency={currency} icon="income" />
                <Summary label="Despesas" amount={expense.toString()} currency={currency} icon="expense" />
                <Summary label="Saldo até o fim do período" amount={report.balancesByCurrency[currency] ?? "0"} currency={currency} icon="balance" />
                <Summary label="Resultado" amount={net.toString()} currency={currency} icon="net" />
              </div>
            </CardContent>
          </Card>
        </section>;
      })}
    </>}
  </div>;
}

function PeriodComparison({ currency, previous, current }: { currency: string; previous: ReportSeriesPoint; current: ReportSeriesPoint }) {
  const changes = [
    { label: "Receitas", before: BigInt(previous.incomeMinorByCurrency[currency] ?? "0"), after: BigInt(current.incomeMinorByCurrency[currency] ?? "0") },
    { label: "Despesas líquidas", before: BigInt(previous.expenseMinorByCurrency[currency] ?? "0"), after: BigInt(current.expenseMinorByCurrency[currency] ?? "0") },
  ];
  return <Card><CardContent className="grid gap-3 p-4"><h3 className="text-sm font-medium">Comparação entre os dois últimos meses · {currency}</h3><div className="grid gap-3 sm:grid-cols-2">{changes.map(({ label, before, after }) => {
    const delta = after - before;
    const percent = percentChangeBasisPoints(before, after);
    return <div key={label} className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-mono text-sm">{delta > 0n ? "+" : ""}{formatMinor(delta.toString(), currency)} <span className="text-xs text-muted-foreground">{percent === null ? "· sem base para percentual" : `· ${percent > 0n ? "+" : ""}${formatPercent(percent)}%`}</span></p></div>;
  })}</div></CardContent></Card>;
}

function MonthlySeries({ currency, series }: { currency: string; series: ReportSeriesPoint[] }) {
  return <Card>
    <CardContent className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="font-mono text-[10px] tracking-[.14em] text-muted-foreground">HISTÓRICO MENSAL</p><h3 className="mt-1 text-base font-medium">Receitas e despesas <span className="font-mono text-xs text-muted-foreground">{currency}</span></h3></div>
        <div className="flex gap-3 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full bg-success" />Receitas</span><span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full bg-destructive" />Despesas</span></div>
      </div>
      <MonthlyFinanceChart series={series} currency={currency} />
      <p className="mt-3 text-xs text-muted-foreground">Cada mês mantém sua moeda original; valores não são convertidos.</p>
    </CardContent>
  </Card>;
}

function CategoryBreakdown({ currency, categories, loading }: { currency: string; categories: ReportCategory[]; loading: boolean }) {
  const rows = categories.filter(item => item.currency === currency);

  return <Card>
    <CardContent className="p-4 sm:p-5">
      <div><p className="font-mono text-[10px] tracking-[.14em] text-muted-foreground">DISTRIBUIÇÃO</p><h3 className="mt-1 text-base font-medium">Por categoria <span className="font-mono text-xs text-muted-foreground">{currency}</span></h3></div>
      {loading ? <p role="status" className="mt-5 text-sm text-muted-foreground">Atualizando categorias…</p> : <AmountFinanceChart currency={currency} rows={rows.map(item => ({ label: item.categoryName ?? "Sem categoria", amountMinor: item.expenseMinor }))} />}
      <p className="mt-4 text-xs text-muted-foreground">Despesas classificadas no período. Receitas e resultados por categoria não são somados a este total.</p>
    </CardContent>
  </Card>;
}

function MetricCard({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: "saving" | "spend" | "net" }) {
  const Icon = icon === "saving" ? ChartNoAxesCombinedIcon : icon === "spend" ? ArrowUpRightIcon : WalletIcon;
  return <Card><CardContent className="flex min-h-32 flex-col justify-between gap-3 p-4 sm:p-5"><div className="flex items-center justify-between gap-2"><p className="font-mono text-[10px] tracking-[.12em] text-muted-foreground">{label.toLocaleUpperCase("pt-BR")}</p><Icon aria-hidden="true" className="size-4 shrink-0 text-primary" /></div><div><p className="break-words font-mono text-2xl font-medium tracking-tight tabular-nums sm:text-3xl">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div></CardContent></Card>;
}

function Summary({ label, amount, currency, icon }: { label: string; amount: string; currency: string; icon: "income" | "expense" | "balance" | "net" }) {
  const Icon = icon === "income" ? ArrowDownLeftIcon : icon === "expense" ? ArrowUpRightIcon : WalletIcon;
  return <div className="min-w-0 rounded-lg bg-muted/50 p-3"><div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon aria-hidden="true" className="size-3.5" />{label}</div><p className="mt-2 break-words font-mono text-sm font-medium tabular-nums">{formatMinor(amount, currency)}</p></div>;
}


function periodDays(from: string, to: string) {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  return Math.max(1, Math.floor((end - start) / 86400000) + 1);
}

function formatPercent(basisPoints: bigint) {
  const absolute = basisPoints < 0n ? -basisPoints : basisPoints;
  const value = `${absolute / 100n}${absolute % 100n ? `,${String(absolute % 100n).padStart(2, "0")}` : ""}`;
  return `${basisPoints < 0n ? "−" : ""}${value}`;
}
