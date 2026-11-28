"use client";

import { AnimatedPercentage } from "./animated-percentage";
import { ArrowDownLeftIcon, ArrowUpRightIcon, CalendarDaysIcon, ChartNoAxesCombinedIcon, WalletIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { ChartSkeleton, CategorySkeleton } from "./workspace-skeleton";
import { MonthlyFinanceChart, AmountFinanceChart } from "./finance-charts";
import type { CategoryReport, MonthlySummary } from "@finance/contracts";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatMinor, formatReportMonth, percentChangeBasisPoints, reportPeriod, type ReportRange } from "./finance-format";

export type ReportsSummary = MonthlySummary;
export type ReportSeriesPoint = Pick<MonthlySummary, "from" | "to" | "incomeMinorByCurrency" | "expenseMinorByCurrency">;
export type ReportCategory = CategoryReport;

export type ReportsDashboardProps = {
  range: ReportRange;
  spending?: React.ReactNode;
  onRangeChange: (range: ReportRange) => void;
  report: ReportsSummary | null;
  series: ReportSeriesPoint[];
  categories: ReportCategory[];
  analyticsLoading: boolean;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
};

const rangeLabels = { month: "Este mês", "last-month": "Mês passado", year: "Este ano" };

export function ReportsDashboard({ range, onRangeChange, report, series, categories, analyticsLoading, loading = false, error, onRetry, spending }: ReportsDashboardProps) {
  const pending = !report && !error;
  const period = report ? { from: report.from, to: report.to } : reportPeriod(range);
  const currencies = [...new Set(["BRL",
    ...Object.keys(report?.incomeMinorByCurrency ?? {}),
    ...Object.keys(report?.expenseMinorByCurrency ?? {}),
  ])].sort();

  return <div className="grid gap-4 lg:gap-6">
    <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-card px-3 py-2 sm:w-fit">
      <CalendarDaysIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <NativeSelect aria-label="Período do relatório" value={range} onChange={event => onRangeChange(event.target.value as ReportRange)} className="min-h-11 min-w-0 flex-1 border-0 bg-transparent px-0 shadow-none sm:min-w-36">
        {!(range in rangeLabels) && <option value={range}>{formatReportMonth(period.from)}</option>}
        {Object.entries(rangeLabels).map(([option, label]) => <option key={option} value={option}>{label}</option>)}
      </NativeSelect>
      <span className="w-full pl-7 text-xs tabular-nums text-muted-foreground sm:w-auto sm:pl-0" aria-live="polite">{report ? `${formatDate(report.from)} – ${formatDate(report.to)}` : "Carregando período…"}</span>
    </div>

    {error ? <Card><CardContent className="flex flex-wrap items-center justify-between gap-3 p-4"><p role="alert" className="text-sm text-destructive">{error}</p>{onRetry && <Button variant="outline" onClick={onRetry}>Tentar novamente</Button>}</CardContent></Card> : null}
    {loading && <p role="status" className="sr-only">{report ? "Atualizando relatório…" : "Carregando relatório…"}</p>}

    {spending}
    {!error && <>
      {currencies.map(currency => {
        const income = BigInt(report?.incomeMinorByCurrency[currency] ?? "0");
        const expense = BigInt(report?.expenseMinorByCurrency[currency] ?? "0");
        const net = income - expense;
        const savingRate = income > 0n ? (net * 10000n) / income : null;
        const days = periodDays(period.from, period.to);
        const dailySpend = expense < 0n ? -((-expense + BigInt(days) / 2n) / BigInt(days)) : (expense + BigInt(days) / 2n) / BigInt(days);

        return <section key={currency} aria-labelledby={`report-${currency}`} className="grid gap-4 lg:gap-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <MetricCard loading={pending} label="Taxa de poupança" value={savingRate === null ? "—" : `${formatPercent(savingRate)}%`} detail={savingRate === null ? "Sem receitas no período" : "Resultado ÷ receitas"} icon="saving" />
            <MetricCard loading={pending} label="Gasto médio por dia" value={formatMinor(dailySpend.toString(), currency)} detail={`${days} dias no período · ${currency}`} icon="spend" />
            <div className="sm:col-span-2 xl:col-span-1"><MetricCard loading={pending} label="Resultado do período" value={formatMinor(net.toString(), currency)} detail={`Receitas menos despesas · ${currency}`} icon="net" /></div>
          </div>

          <Card><CardContent className="p-4 text-sm text-muted-foreground"><p className="font-medium text-foreground">Resumo do período</p><div className="mt-1 min-h-10">{pending ? <Skeleton aria-label="Carregando resumo" className="h-5 w-full" /> : <p>{net > 0n ? "As receitas superaram as despesas em " : net < 0n ? "As despesas superaram as receitas em " : "Receitas e despesas ficaram iguais em "}<strong className="font-mono text-foreground">{formatMinor((net < 0n ? -net : net).toString(), currency)}</strong>.</p>}</div></CardContent></Card>

          <PeriodComparison loading={analyticsLoading && !series.length} currency={currency} previous={series[series.length - 2]} current={series[series.length - 1]} />
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(15rem,1fr)] lg:gap-5">
            <MonthlySeries loading={analyticsLoading && !series.length} currency={currency} series={series} />
            <CategoryBreakdown currency={currency} categories={categories} loading={analyticsLoading} />
          </div>

          <Card>
            <CardContent className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,.8fr)] lg:items-center lg:gap-8">
              <div>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><p className="font-mono text-[10px] tracking-[.14em] text-muted-foreground">TOTAIS DO PERÍODO</p><h2 id={`report-${currency}`} className="mt-1 text-lg font-medium">Receitas e despesas <span className="font-mono text-xs text-muted-foreground">{currency}</span></h2></div>
                  <div className="flex gap-3 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full bg-success" />Receitas</span><span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full bg-destructive" />Despesas</span></div>
                </div>
                {pending ? <ChartSkeleton variant="amount" /> : <AmountFinanceChart currency={currency} rows={[{ label: "Receitas", amountMinor: income.toString(), fill: "var(--chart-income)" }, { label: "Despesas", amountMinor: expense.toString(), fill: "var(--chart-expense)" }]} />}
                <p className="mt-4 text-xs text-muted-foreground">Totais do período selecionado. Cada moeda é apresentada separadamente, sem conversão.</p>
              </div>
              <div className="grid grid-cols-2 gap-3 border-t border-border pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                <Summary loading={pending} label="Receitas" amount={income.toString()} currency={currency} icon="income" />
                <Summary loading={pending} label="Despesas" amount={expense.toString()} currency={currency} icon="expense" />
                <Summary loading={pending} label="Saldo até o fim do período" amount={report?.balancesByCurrency[currency] ?? "0"} currency={currency} icon="balance" />
                <Summary loading={pending} label="Resultado" amount={net.toString()} currency={currency} icon="net" />
              </div>
            </CardContent>
          </Card>
        </section>;
      })}
    </>}
  </div>;
}

function PeriodComparison({ currency, previous, current, loading }: { currency: string; previous?: ReportSeriesPoint; current?: ReportSeriesPoint; loading: boolean }) {
  const changes = [
    { label: "Receitas", before: BigInt(previous?.incomeMinorByCurrency[currency] ?? "0"), after: BigInt(current?.incomeMinorByCurrency[currency] ?? "0") },
    { label: "Despesas líquidas", before: BigInt(previous?.expenseMinorByCurrency[currency] ?? "0"), after: BigInt(current?.expenseMinorByCurrency[currency] ?? "0") },
  ];
  return <Card><CardContent className="grid gap-3 p-4"><h3 className="text-sm font-medium">Comparação entre os dois últimos meses · {currency}</h3><div className="grid gap-3 sm:grid-cols-2">{changes.map(({ label, before, after }) => {
    const delta = after - before;
    const percent = percentChangeBasisPoints(before, after);
    return <div key={label} className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">{label}</p><div className="mt-1 min-h-10 font-mono text-sm">{loading ? <Skeleton aria-label="Carregando comparação" className="h-5 w-3/4" /> : !previous || !current ? <p className="text-xs text-muted-foreground">Sem base para comparação.</p> : <p>{delta > 0n ? "+" : ""}{formatMinor(delta.toString(), currency)} <span className="text-xs text-muted-foreground">{percent === null ? "· sem base para percentual" : `· ${percent > 0n ? "+" : ""}${formatPercent(percent)}%`}</span></p>}</div></div>;
  })}</div></CardContent></Card>;
}

function MonthlySeries({ currency, series, loading }: { currency: string; series: ReportSeriesPoint[]; loading: boolean }) {
  return <Card>
    <CardContent className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="font-mono text-[10px] tracking-[.14em] text-muted-foreground">HISTÓRICO MENSAL</p><h3 className="mt-1 text-base font-medium">Receitas e despesas <span className="font-mono text-xs text-muted-foreground">{currency}</span></h3></div>
        <div className="flex gap-3 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full bg-success" />Receitas</span><span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full bg-destructive" />Despesas</span></div>
      </div>
      {loading ? <ChartSkeleton /> : <MonthlyFinanceChart series={series} currency={currency} />}
      <p className="mt-3 text-xs text-muted-foreground">Cada mês mantém sua moeda original; valores não são convertidos.</p>
    </CardContent>
  </Card>;
}

function CategoryBreakdown({ currency, categories, loading }: { currency: string; categories: ReportCategory[]; loading: boolean }) {
  const rows = categories.filter(item => item.currency === currency);
  const total = rows.reduce((sum, item) => sum + BigInt(item.expenseMinor), 0n);

  return <Card id={`spending-by-category-${currency}`} className="scroll-mt-20">
    <CardContent className="p-4 sm:p-5">
      <div><p className="font-mono text-[10px] tracking-[.14em] text-muted-foreground">DISTRIBUIÇÃO DAS DESPESAS</p><h3 className="mt-1 text-lg font-medium">Por categoria <span className="font-mono text-xs text-muted-foreground">{currency}</span></h3></div>
      <div className="mt-5 min-h-56" aria-busy={loading}>{loading && rows.length === 0 ? <CategorySkeleton /> : rows.length === 0 ? <p className="mt-5 text-sm text-muted-foreground">Sem despesas por categoria neste período.</p> : <ul className="grid gap-4">{rows.map(item => {
        const amount = BigInt(item.expenseMinor);
        const share = total > 0n ? Number((amount * 10000n) / total) / 100 : null;
        return <li key={item.categoryId ?? "sem-categoria"}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm"><span className="min-w-0 break-words">{item.categoryName ?? "Sem categoria"}</span><span className="font-mono text-xs tabular-nums">{formatMinor(item.expenseMinor, currency)} <span className="text-muted-foreground">{share === null ? "—" : <AnimatedPercentage value={share} />}</span></span></div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true"><div className="share-bar h-full w-full rounded-full bg-primary" style={{ transform: `scaleX(${Math.max(0, Math.min(100, share ?? 0)) / 100})` }} /></div>
        </li>;
      })}</ul>}</div>
      <p className="mt-4 text-xs text-muted-foreground">Participação nas despesas classificadas do período. Valores negativos não são representados na barra.</p>
    </CardContent>
  </Card>;
}

function MetricCard({ label, value, detail, icon, loading }: { loading: boolean; label: string; value: string; detail: string; icon: "saving" | "spend" | "net" }) {
  const Icon = icon === "saving" ? ChartNoAxesCombinedIcon : icon === "spend" ? ArrowUpRightIcon : WalletIcon;
  return <Card><CardContent className="flex min-h-32 min-w-0 flex-col justify-between gap-3 p-4 sm:p-5"><div className="flex items-center justify-between gap-2"><p className="font-mono text-[10px] tracking-[.12em] text-muted-foreground">{label.toLocaleUpperCase("pt-BR")}</p><Icon aria-hidden="true" className="size-4 shrink-0 text-primary" /></div><div><div className="font-mono text-xl font-medium tracking-tight tabular-nums sm:text-3xl">{loading ? <Skeleton aria-label="Carregando indicador" className="h-[1lh] w-3/4" /> : <p className="break-words">{value}</p>}</div><div className="mt-1 min-h-4 text-xs text-muted-foreground">{loading ? <Skeleton aria-hidden="true" className="h-4 w-1/2" /> : detail}</div></div></CardContent></Card>;
}

function Summary({ label, amount, currency, icon, loading }: { loading: boolean; label: string; amount: string; currency: string; icon: "income" | "expense" | "balance" | "net" }) {
  const Icon = icon === "income" ? ArrowDownLeftIcon : icon === "expense" ? ArrowUpRightIcon : WalletIcon;
  return <div className="min-w-0 rounded-lg bg-muted/50 p-3"><div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon aria-hidden="true" className="size-3.5" />{label}</div><div className="mt-2 font-mono text-sm font-medium tabular-nums">{loading ? <Skeleton aria-label="Carregando valor" className="h-5 w-3/4" /> : <p className="break-words">{formatMinor(amount, currency)}</p>}</div></div>;
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
