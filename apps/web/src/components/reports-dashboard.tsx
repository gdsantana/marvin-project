"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CategorySpendingList } from "./category-spending-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ChartSkeleton, CategorySkeleton } from "./workspace-skeleton";
import { MonthlyFinanceChart } from "./finance-charts";
import { categoryReportResponseSchema, type CategoryReport, type MonthlySummary } from "@finance/contracts";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatCurrencyMinor, formatReportMonth, percentChangeBasisPoints, reportPeriod, type ReportRange } from "./finance-format";
import { categoryChanges, previousCategoryPeriod } from "./reports-data";

export type ReportsSummary = MonthlySummary;
export type ReportSeriesPoint = Pick<MonthlySummary, "from" | "to" | "incomeMinorByCurrency" | "expenseMinorByCurrency">;
export type ReportCategory = CategoryReport;

export type ReportsDashboardProps = {
  range: ReportRange;
  spending?: React.ReactNode;
  reloadToken: number;
  report: ReportsSummary | null;
  series: ReportSeriesPoint[];
  categories: ReportCategory[];
  analyticsLoading: boolean;
  analyticsUnavailable?: boolean;
};

export function ReportsDashboard({ range, report, series, categories, analyticsLoading, analyticsUnavailable = false, spending, reloadToken }: ReportsDashboardProps) {
  const pending = !report;
  const period = report ?? reportPeriod(range);
  const currencies = [...new Set([
    ...Object.keys(report?.balancesByCurrency ?? {}),
    ...Object.keys(report?.incomeMinorByCurrency ?? {}),
    ...Object.keys(report?.expenseMinorByCurrency ?? {}),
  ])].sort();
  if (!currencies.length) currencies.push("BRL");

  return <div className="grid gap-3 sm:gap-4">
    {currencies.map((currency, index) => {
      const income = BigInt(report?.incomeMinorByCurrency[currency] ?? "0");
      const expense = BigInt(report?.expenseMinorByCurrency[currency] ?? "0");
      const net = income - expense;
      const savingRate = income > 0n ? (net * 10000n) / income : null;
      const days = periodDays(period.from, period.to);
      const dailySpend = expense < 0n ? -((-expense + BigInt(days) / 2n) / BigInt(days)) : (expense + BigInt(days) / 2n) / BigInt(days);
      const showSpending = index === 0 && spending;
      const hasComparison = !analyticsUnavailable;

      return <section key={currency} aria-labelledby={`report-${currency}`} className="grid min-w-0 gap-3 sm:gap-4">
        <Card size="sm" className="gap-2 px-1">
          <CardHeader>
            <CardTitle><h2 id={`report-${currency}`}>Resumo do período{currencies.length > 1 && ` · ${currency}`}</h2></CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_repeat(2,minmax(0,1fr))] lg:gap-x-4">
              <Metric loading={pending} label="Resultado do período" value={formatCurrencyMinor(net.toString(), currency)} className={net < 0n ? "text-destructive" : undefined} />
              <Metric loading={pending} label={`Patrimônio em ${formatDate(period.to)}`} value={formatCurrencyMinor(report?.balancesByCurrency[currency] ?? "0", currency)} />
              <Metric loading={pending} label="Receitas" value={formatCurrencyMinor(income.toString(), currency)} className="text-primary" />
              <Metric loading={pending} label="Despesas líquidas" value={formatCurrencyMinor(expense.toString(), currency)} className="text-destructive" />
            </dl>
          </CardContent>
        </Card>

        {!analyticsUnavailable && <div className="grid min-w-0 gap-3 sm:gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <MonthlySeries loading={analyticsLoading && !series.length} currency={currency} series={series} />
          <CategoryBreakdown currency={currency} categories={categories} loading={analyticsLoading} range={range} from={period.from} to={period.to} reloadToken={reloadToken} />
        </div>}

        <div className={showSpending ? "grid min-w-0 gap-3 sm:gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]" : "grid gap-3"}>
          <Card>
            <CardHeader><CardTitle><h3>Indicadores do período</h3></CardTitle></CardHeader>
            <CardContent className="grid gap-4">
              <dl className="grid grid-cols-2 gap-3">
                <Metric loading={pending} label="Taxa de poupança" value={savingRate === null ? "—" : `${formatPercent(savingRate)}%`} detail={savingRate === null ? "Sem receitas no período" : "Resultado ÷ receitas"} />
                <Metric loading={pending} label="Gasto médio por dia" value={formatCurrencyMinor(dailySpend.toString(), currency)} detail={`${days} dias no período`} />
              </dl>
              {hasComparison && <PeriodComparison loading={analyticsLoading && !series.length} currency={currency} previous={series[series.length - 2]} current={series[series.length - 1]} />}
            </CardContent>
          </Card>
          {showSpending}
        </div>
      </section>;
    })}
  </div>;
}

function PeriodComparison({ currency, previous, current, loading }: { currency: string; previous?: ReportSeriesPoint; current?: ReportSeriesPoint; loading: boolean }) {
  const changes = [
    { label: "Receitas", before: BigInt(previous?.incomeMinorByCurrency[currency] ?? "0"), after: BigInt(current?.incomeMinorByCurrency[currency] ?? "0") },
    { label: "Despesas líquidas", before: BigInt(previous?.expenseMinorByCurrency[currency] ?? "0"), after: BigInt(current?.expenseMinorByCurrency[currency] ?? "0") },
  ];
  return <section className="grid gap-2 border-t border-border pt-4">
    <h4 className="text-sm font-medium">Comparação mensal</h4>
    {previous && current && <p className="text-xs text-muted-foreground">{formatReportMonth(previous.from)} e {formatReportMonth(current.from)}</p>}
    <dl className="grid grid-cols-2 gap-3">{changes.map(({ label, before, after }) => {
      const delta = after - before;
      const percent = percentChangeBasisPoints(before, after);
      return <Metric key={label} label={label} loading={loading} value={previous && current ? `${delta > 0n ? "+" : ""}${formatCurrencyMinor(delta.toString(), currency)}` : "—"} detail={!previous || !current ? "Sem base para comparação" : percent === null ? "Sem base para percentual" : `${percent > 0n ? "+" : ""}${formatPercent(percent)}%`} />;
    })}</dl>
  </section>;
}

function MonthlySeries({ currency, series, loading }: { currency: string; series: ReportSeriesPoint[]; loading: boolean }) {
  return <Card className="min-w-0">
    <CardHeader>
      <CardTitle><h3>Evolução mensal</h3></CardTitle>
      {series.length > 0 && <p className="text-sm text-muted-foreground">{formatDate(series[0]!.from)} a {formatDate(series[series.length - 1]!.to)}</p>}
    </CardHeader>
    <CardContent>{loading ? <ChartSkeleton /> : <MonthlyFinanceChart series={series} currency={currency} variant="line" compactEmpty />}</CardContent>
  </Card>;
}

function CategoryBreakdown({ currency, categories, loading, range, from, to, reloadToken }: { currency: string; categories: ReportCategory[]; loading: boolean; range: ReportRange; from: string; to: string; reloadToken: number }) {
  const [mode, setMode] = useState<"distribution" | "comparison">("distribution");
  const rows = categories.filter(item => item.currency === currency);

  return <Card id={`spending-by-category-${currency}`} className="min-w-0 scroll-mt-20">
    <CardHeader className="gap-2">
      <CardTitle><h3>Gastos por categoria</h3></CardTitle>
      <div role="group" aria-label="Visualização dos gastos por categoria" className="inline-flex w-fit max-w-full flex-wrap gap-0.5 rounded-lg bg-muted p-0.5">
        <Button variant="ghost" type="button" aria-pressed={mode === "distribution"} onClick={() => setMode("distribution")} className="pointer-fine:min-h-8 aria-pressed:bg-background">Distribuição</Button>
        <Button variant="ghost" type="button" aria-pressed={mode === "comparison"} onClick={() => setMode("comparison")} className="pointer-fine:min-h-8 aria-pressed:bg-background">Comparação</Button>
      </div>
    </CardHeader>
    <CardContent className="@container" aria-busy={loading}>
      {mode === "comparison" ? <CategoryComparison key={`${from}:${to}`} currency={currency} current={rows} range={range} from={from} to={to} loading={loading} reloadToken={reloadToken} /> : loading && rows.length === 0 ? <CategorySkeleton /> : <CategorySpendingList rows={rows} currency={currency} />}
    </CardContent>
  </Card>;
}

function CategoryComparison({ currency, current, range, from, to, loading, reloadToken }: { currency: string; current: ReportCategory[]; range: ReportRange; from: string; to: string; loading: boolean; reloadToken: number }) {
  const router = useRouter();
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ token: number; retry: number; data: ReportCategory[] | null }>();
  const previous = previousCategoryPeriod(range, from);
  const query = previous && new URLSearchParams(previous).toString();

  useEffect(() => {
    if (!query) return;
    const controller = new AbortController();
    fetch(`/api/v1/reports/categories?${query}`, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (controller.signal.aborted) return;
        if (response.status === 401) { router.replace("/login"); return; }
        const result = categoryReportResponseSchema.parse(await response.json());
        if (!response.ok || !result.ok) throw new Error();
        if (!controller.signal.aborted) setResult({ token: reloadToken, retry, data: result.data });
      })
      .catch(() => { if (!controller.signal.aborted) setResult({ token: reloadToken, retry, data: null }); });
    return () => controller.abort();
  }, [query, reloadToken, retry, router]);

  if (!previous) return <p className="text-sm text-muted-foreground">Não há período anterior para comparar.</p>;
  if (loading || !result || result.token !== reloadToken || result.retry !== retry) return <div role="status"><span className="sr-only">Carregando comparação por categoria</span><CategorySkeleton /></div>;
  if (!result.data) return <Alert variant="destructive"><AlertDescription>Não foi possível carregar a comparação. <Button variant="outline" onClick={() => setRetry(value => value + 1)}>Tentar novamente</Button></AlertDescription></Alert>;
  const rows = categoryChanges(current, result.data, currency);
  const periodLabel = (start: string, end: string) => range === "year" ? `${start.slice(0, 4)}` : `${formatDate(start)} a ${formatDate(end)}`;

  return <div className="grid gap-3">
    <p className="text-xs text-muted-foreground">{periodLabel(from, to)} vs. {periodLabel(previous.from, previous.to)}</p>
    {rows.length === 0 ? <p className="text-sm text-muted-foreground">Sem despesas por categoria nos períodos comparados.</p> : <ul className="divide-y divide-border">
      {rows.map(row => {
        const percent = percentChangeBasisPoints(row.previous, row.current);
        return <li key={row.id ?? "sem-categoria"} className="grid gap-2 py-3 first:pt-0 last:pb-0">
          <p className="text-sm font-medium [overflow-wrap:anywhere]">{row.name}</p>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs @min-[24rem]:grid-cols-3">
            <div className="min-w-0"><dt className="text-muted-foreground">Anterior</dt><dd className="font-mono tabular-nums [overflow-wrap:anywhere]">{formatCurrencyMinor(row.previous.toString(), currency)}</dd></div>
            <div className="min-w-0"><dt className="text-muted-foreground">Atual</dt><dd className="font-mono tabular-nums [overflow-wrap:anywhere]">{formatCurrencyMinor(row.current.toString(), currency)}</dd></div>
            <div className="min-w-0"><dt className="text-muted-foreground">Variação</dt><dd className={`font-mono tabular-nums [overflow-wrap:anywhere] ${row.delta > 0n ? "text-destructive" : row.delta < 0n ? "text-primary" : ""}`}>
              <span>{row.delta > 0n ? "+" : ""}{formatCurrencyMinor(row.delta.toString(), currency)}</span>
              {percent !== null && <span className="ml-1 text-muted-foreground">{percent > 0n ? "+" : ""}{formatPercent(percent)}%</span>}
            </dd>{percent === null && <dd className="text-muted-foreground">Sem base percentual</dd>}</div>
          </dl>
        </li>;
      })}
    </ul>}
  </div>;
}

function Metric({ label, value, detail, loading, className }: { label: string; value: string; detail?: string; loading: boolean; className?: string }) {
  return <div className="grid min-w-0 content-start gap-0.5">
    <dt className="text-sm text-muted-foreground">{label}</dt>
    <dd className={`font-mono text-lg font-medium tabular-nums [overflow-wrap:anywhere] ${className ?? ""}`}>{loading ? <Skeleton aria-label="Carregando valor" className="h-[1lh] w-3/4" /> : value}</dd>
    {detail && !loading && <dd className="text-xs text-muted-foreground">{detail}</dd>}
  </div>;
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
