"use client";

import { useSyncExternalStore } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, Pie, PieChart, ReferenceLine, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { formatCurrencyMinor, formatMinor } from "./finance-format";
import { amountChartData, magnitude, monthlyChartData, type FinanceSeriesPoint } from "./finance-chart-data";


const motionQuery = "(prefers-reduced-motion: reduce)";
function subscribeMotion(callback: () => void) {
  const media = window.matchMedia(motionQuery);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
function useChartAnimation() {
  return !useSyncExternalStore(subscribeMotion, () => window.matchMedia(motionQuery).matches, () => true);
}

const monthlyConfig = {
  income: { label: "Receitas", color: "var(--chart-income)" },
  expense: { label: "Despesas líquidas", color: "var(--chart-expense)" },
} satisfies ChartConfig;

const compactMoney = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

function monthlyTickLabel(coordinate: number, maximum: bigint, currency: string) {
  const amount = (BigInt(Math.round(coordinate * 10_000)) * maximum) / 1_000_000n;
  if (magnitude(amount) < 100_000n) return formatCurrencyMinor(amount.toString(), currency);
  const symbol = currency === "BRL" ? "R$" : currency;
  return `${amount < 0n ? "−" : ""}${symbol} ${compactMoney.format(magnitude(amount) / 100n)}`;
}

export function MonthlyFinanceChart({ series, currency, variant = "bar", showLegend = true, compactEmpty = false }: { series: FinanceSeriesPoint[]; currency: string; variant?: "bar" | "line"; showLegend?: boolean; compactEmpty?: boolean }) {
  const animate = useChartAnimation();
  const { rows: data, maximum } = monthlyChartData(series, currency);
  const isLine = variant === "line";
  const Chart = isLine ? LineChart : BarChart;
  const formatAmount = isLine ? formatCurrencyMinor : formatMinor;
  if (!data.some(row => BigInt(row.incomeMinor) !== 0n || BigInt(row.expenseMinor) !== 0n)) return <div className={compactEmpty ? "h-40" : "h-64 lg:h-72"}><ChartEmpty /></div>;
  return <>
    <div className="relative"><ChartContainer config={monthlyConfig} className="h-64 min-h-64 w-full min-w-0 aspect-auto lg:h-72" aria-label={`Receitas e despesas líquidas por mês em ${currency}`}>
      <Chart accessibilityLayer data={data} margin={{ top: 12, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tick={{ fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} tickMargin={10} minTickGap={isLine ? 6 : 12}
          padding={isLine ? { left: 6, right: 6 } : undefined} tickFormatter={isLine ? (label: string) => label.split(" de ")[0]!.replace(/\.$/, "") : undefined} />
        {isLine ? <YAxis width="auto" tickCount={4} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickLine={false} axisLine={false} tickMargin={8}
          domain={[(min: number) => Math.min(0, min), (max: number) => Math.max(0, max)]}
          tickFormatter={coordinate => monthlyTickLabel(coordinate, maximum, currency)} /> : <YAxis hide domain={["auto", "auto"]} />}
        <ReferenceLine y={0} stroke="var(--border)" />
        <ChartTooltip content={<ChartTooltipContent formatter={(_value, name, item) => {
          const row = item.payload as (typeof data)[number];
          const key = name === "income" ? "incomeMinor" : "expenseMinor";
          return <span>{name === "income" ? monthlyConfig.income.label : monthlyConfig.expense.label}: <span className="font-mono">{formatAmount(row[key], currency)}</span></span>;
        }} />} />
        {showLegend && <ChartLegend content={<ChartLegendContent />} />}
        {isLine ? <>
          <Line dataKey="income" stroke="var(--color-income)" strokeWidth={2.5} dot={{ r: 2.5 }} isAnimationActive={animate} animationBegin={0} animationDuration={280} animationEasing="ease-in-out" />
          <Line dataKey="expense" stroke="var(--color-expense)" strokeWidth={2.5} strokeDasharray="5 4" dot={{ r: 2.5 }} isAnimationActive={animate} animationBegin={0} animationDuration={280} animationEasing="ease-in-out" />
        </> : <>
          <Bar dataKey="income" fill="var(--color-income)" radius={3} maxBarSize={28} isAnimationActive={animate} animationBegin={0} animationDuration={280} animationEasing="ease-in-out" />
          <Bar dataKey="expense" fill="var(--color-expense)" radius={3} maxBarSize={28} isAnimationActive={animate} animationBegin={0} animationDuration={280} animationEasing="ease-in-out" />
        </>}
      </Chart>
    </ChartContainer></div>
    <table className="sr-only"><caption>Valores mensais em {currency}</caption><thead><tr><th>Mês</th><th>{monthlyConfig.income.label}</th><th>{monthlyConfig.expense.label}</th></tr></thead><tbody>{data.map((row, index) => <tr key={index}><th>{row.label}</th><td>{formatAmount(row.incomeMinor, currency)}</td><td>{formatAmount(row.expenseMinor, currency)}</td></tr>)}</tbody></table>
  </>;
}

export function ExpenseDonutChart({ rows, currency, groupLabel = "categoria", totalLabel = "Despesas líquidas", compact = false }: { rows: { label: string; amountMinor: string; fill: string }[]; currency: string; groupLabel?: string; totalLabel?: string; compact?: boolean }) {
  const animate = useChartAnimation();
  const data = amountChartData(rows).map(row => ({ ...row, value: Math.abs(row.value) }));
  const formatAmount = compact ? formatCurrencyMinor : formatMinor;
  if (!data.some(row => row.value !== 0)) return <div className="my-4 h-56"><ChartEmpty /></div>;
  const total = rows.reduce((sum, row) => sum + BigInt(row.amountMinor), 0n);
  return <div className={`relative mx-auto w-full ${compact ? "max-w-48" : "my-4 max-w-64"}`}>
    <ChartContainer config={{ value: { label: "Despesas" } }} className={`w-full aspect-auto ${compact ? "h-44 min-h-44" : "h-56 min-h-56"}`} aria-label={`Distribuição das despesas por ${groupLabel} em ${currency}`}>
      <PieChart accessibilityLayer>
        <ChartTooltip content={<ChartTooltipContent hideLabel formatter={(_value, _name, item) => {
          const row = item.payload as (typeof data)[number];
          return <span>{row.label}: <span className="font-mono">{formatAmount(row.amountMinor, currency)}</span></span>;
        }} />} />
        <Pie data={data} dataKey="value" nameKey="label" innerRadius="68%" outerRadius="90%" strokeWidth={2} stroke="var(--card)" isAnimationActive={animate} animationBegin={0} animationDuration={280} animationEasing="ease-in-out" />
      </PieChart>
    </ChartContainer>

    <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><div className={compact ? "w-3/5 max-w-28 text-center" : "max-w-32 text-center"}><p className="text-xs text-muted-foreground">{totalLabel}</p><p className="break-words font-mono text-sm font-medium">{formatAmount(total.toString(), currency)}</p>{groupLabel === "categoria" && !compact && <p className="mt-1 text-xs text-muted-foreground">{rows.length} categorias</p>}</div></div>
  </div>;
}

function ChartEmpty() {
  return <Empty className="h-full min-h-40"><EmptyDescription>Sem movimentações neste período.</EmptyDescription></Empty>;
}
