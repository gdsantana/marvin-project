import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrencyMinor, formatReportMonth } from "./finance-format";
import { upcomingCommitments } from "./reports-data";
import type { ExpenseForecastOption, StatementOption } from "./workspace-types";

export function ReportCommitments({ statements, forecasts, loading }: { statements: StatementOption[]; forecasts: ExpenseForecastOption[]; loading: boolean }) {
  const months = upcomingCommitments(statements, forecasts);
  const hasCommitments = months.some(month => month.statementsMinor > 0n || month.forecastsMinor > 0n);
  const currency = (minor: bigint) => formatCurrencyMinor(minor.toString(), "BRL");

  return <Card className="min-w-0">
    <CardHeader>
      <CardTitle><h2>Compromissos futuros</h2></CardTitle>
      <CardDescription>Faturas a pagar, incluindo parcelas, e previsões avulsas dos próximos três meses.</CardDescription>
    </CardHeader>
    <CardContent className="grid gap-3" aria-busy={loading}>
      {loading ? <div role="status" className="grid gap-2"><span className="sr-only">Carregando compromissos futuros</span><Skeleton className="h-20" /></div>
        : !hasCommitments ? <p className="text-sm text-muted-foreground">Sem compromissos registrados para os próximos três meses.</p>
        : <ul className="grid divide-y divide-border lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          {months.map(({ month, statementsMinor, forecastsMinor }) => <li key={month} className="grid min-w-0 gap-2 py-3 first:pt-0 last:pb-0 lg:px-4 lg:py-0 lg:first:pl-0 lg:last:pr-0">
            <p className="text-sm font-medium">{formatReportMonth(`${month}-01`)}</p>
            <dl className="grid gap-1 text-sm">{([["Faturas a pagar", statementsMinor], ["Previsões avulsas", forecastsMinor], ["Total", statementsMinor + forecastsMinor]] as const).map(([label, value]) =>
              <div key={label} className="flex flex-wrap items-baseline justify-between gap-x-2 last:mt-1 last:border-t last:pt-1.5">
                <dt className="text-muted-foreground">{label}</dt><dd className="min-w-0 font-mono tabular-nums [overflow-wrap:anywhere]">{currency(value)}</dd>
              </div>)}
            </dl>
          </li>)}
        </ul>}
      <div className="flex flex-wrap gap-x-4">
        <Link href="/statements" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary hover:underline">Ver faturas <ArrowRightIcon aria-hidden="true" className="size-3.5" /></Link>
        <Link href="/entries#previsoes" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary hover:underline">Ver previsões <ArrowRightIcon aria-hidden="true" className="size-3.5" /></Link>
      </div>
    </CardContent>
  </Card>;
}
