"use client";

import { Bar, BarChart, CartesianGrid, Pie, PieChart, ReferenceLine, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { formatMinor } from "./finance-format";
import { amountChartData, monthlyChartData, type FinanceSeriesPoint } from "./finance-chart-data";

const monthlyConfig = {
  income: { label: "Entradas", color: "var(--chart-income)" },
  expense: { label: "Saídas líquidas", color: "var(--chart-expense)" },
} satisfies ChartConfig;

export function MonthlyFinanceChart({ series, currency }: { series: FinanceSeriesPoint[]; currency: string }) {
  const data = monthlyChartData(series, currency);
  if (!data.some(row => BigInt(row.incomeMinor) !== 0n || BigInt(row.expenseMinor) !== 0n)) return <ChartEmpty />;
  return <>
    <ChartContainer config={monthlyConfig} className="h-64 min-h-64 w-full min-w-0 aspect-auto lg:h-72" aria-label={`Entradas e saídas mensais em ${currency}`}>
      <BarChart accessibilityLayer data={data} margin={{ top: 12, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} minTickGap={12} />
        <YAxis hide domain={["auto", "auto"]} />
        <ReferenceLine y={0} stroke="var(--border)" />
        <ChartTooltip content={<ChartTooltipContent formatter={(_value, name, item) => {
          const row = item.payload as ReturnType<typeof monthlyChartData>[number];
          const key = name === "income" ? "incomeMinor" : "expenseMinor";
          return <span>{name === "income" ? "Entradas" : "Saídas líquidas"}: <span className="font-mono">{formatMinor(row[key], currency)}</span></span>;
        }} />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="income" fill="var(--color-income)" radius={3} maxBarSize={28} isAnimationActive={false} />
        <Bar dataKey="expense" fill="var(--color-expense)" radius={3} maxBarSize={28} isAnimationActive={false} />
      </BarChart>
    </ChartContainer>
    <table className="sr-only"><caption>Valores mensais em {currency}</caption><thead><tr><th>Mês</th><th>Entradas</th><th>Saídas líquidas</th></tr></thead><tbody>{data.map((row, index) => <tr key={index}><th>{row.label}</th><td>{formatMinor(row.incomeMinor, currency)}</td><td>{formatMinor(row.expenseMinor, currency)}</td></tr>)}</tbody></table>
  </>;
}

export function ExpenseDonutChart({ rows, currency }: { rows: { label: string; amountMinor: string; fill: string }[]; currency: string }) {
  const data = amountChartData(rows).map(row => ({ ...row, value: Math.abs(row.value) }));
  if (!data.some(row => row.value !== 0)) return <ChartEmpty />;
  const total = rows.reduce((sum, row) => sum + BigInt(row.amountMinor), 0n);
  return <div className="relative mx-auto my-4 w-full max-w-64">
    <ChartContainer config={{ value: { label: "Despesas" } }} className="h-56 min-h-56 w-full aspect-auto" aria-label={`Distribuição das despesas por categoria em ${currency}`}>
      <PieChart accessibilityLayer>
        <ChartTooltip content={<ChartTooltipContent hideLabel formatter={(_value, _name, item) => {
          const row = item.payload as (typeof data)[number];
          return <span>{row.label}: <span className="font-mono">{formatMinor(row.amountMinor, currency)}</span></span>;
        }} />} />
        <Pie data={data} dataKey="value" nameKey="label" innerRadius="68%" outerRadius="90%" strokeWidth={2} stroke="var(--card)" isAnimationActive={false} />
      </PieChart>
    </ChartContainer>
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><div className="max-w-32 text-center"><p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Despesas líquidas</p><p className="break-words font-mono text-sm font-medium">{formatMinor(total.toString(), currency)}</p><p className="mt-1 text-xs text-muted-foreground">{rows.length} categorias</p></div></div>
  </div>;
}

export function AmountFinanceChart({ rows, currency }: { rows: { label: string; amountMinor: string; fill?: string }[]; currency: string }) {
  const data = amountChartData(rows);
  if (!data.some(row => BigInt(row.amountMinor) !== 0n)) return <ChartEmpty />;
  return <>
    <ChartContainer config={{ value: { label: "Valor", color: "var(--chart-income)" } }} className="min-h-40 w-full min-w-0 aspect-auto" style={{ height: Math.max(160, rows.length * 48) }} aria-label={`Valores por categoria em ${currency}`}>
      <BarChart accessibilityLayer layout="vertical" data={data} margin={{ left: 0, right: 12 }}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" hide domain={["auto", "auto"]} />
        <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} width={100} tickFormatter={label => String(label).length > 14 ? `${String(label).slice(0, 13)}…` : String(label)} />
        <ReferenceLine x={0} stroke="var(--border)" />
        <ChartTooltip content={<ChartTooltipContent hideLabel formatter={(_value, _name, item) => {
          const row = item.payload as (typeof data)[number];
          return <span>{row.label}: <span className="font-mono">{formatMinor(row.amountMinor, currency)}</span></span>;
        }} />} />
        <Bar dataKey="value" fill="var(--color-value)" radius={3} maxBarSize={16} isAnimationActive={false} />
      </BarChart>
    </ChartContainer>
    <ul className="sr-only">{rows.map((row, index) => <li key={index}>{row.label}: {formatMinor(row.amountMinor, currency)}</li>)}</ul>
  </>;
}

function ChartEmpty() {
  return <Empty className="min-h-40"><EmptyDescription>Sem movimentações neste período.</EmptyDescription></Empty>;
}
