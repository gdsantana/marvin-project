"use client";

import { AnimatedPercentage } from "./animated-percentage";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { spendingReportResponseSchema, type SpendingReport } from "@finance/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AmountFinanceChart, ExpenseDonutChart } from "./finance-charts";
import { ChartSkeleton, ListSkeleton } from "./workspace-skeleton";
import { formatMinor } from "./finance-format";

const paymentMethods = {
  credit: { label: "Crédito", fill: "var(--chart-income)" },
  debit: { label: "Débito", fill: "var(--chart-2)" },
  pix: { label: "Pix", fill: "var(--chart-3)" },
  other: { label: "Outros", fill: "var(--chart-4)" },
} satisfies Record<SpendingReport["paymentMethods"][number]["method"], { label: string; fill: string }>;


export function SpendingBreakdown({ accountId, period: { from, to }, reloadToken }: {
  accountId?: string;
  period: { from: string; to: string };
  reloadToken: number;
}) {
  const router = useRouter();
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ key: string; query: string; data: SpendingReport | null }>();
  const [error, setError] = useState(false);
  const query = new URLSearchParams({ from, to, ...(accountId ? { accountId } : {}) }).toString();
  const key = `${query}:${reloadToken}:${retry}`;

  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    fetch(`/api/v1/reports/spending?${query}`, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (response.status === 401 && !controller.signal.aborted) router.replace("/login");
        if (!response.ok) throw new Error();
        const envelope = spendingReportResponseSchema.parse(await response.json());
        if (!envelope.ok) throw new Error(envelope.error.message);
        if (!controller.signal.aborted) setResult({ key, query, data: envelope.data });
      })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [key, query, router]);

  const data = result?.query === query ? result.data : null;
  const loading = !data && !error;
  const categories = (data?.categories ?? []).map(row => ({ label: row.categoryName ?? "Sem categoria", amountMinor: row.amountMinor }));
  const methods = (data?.paymentMethods ?? []).map(row => ({ ...paymentMethods[row.method], amountMinor: row.amountMinor }));
  const total = methods.reduce((sum, row) => sum + BigInt(row.amountMinor), 0n);
  return <> {error && <Alert variant="destructive"><AlertDescription>{data ? "Não foi possível atualizar os gastos. Os dados exibidos podem estar desatualizados." : "Não foi possível carregar os gastos."} <Button variant="outline" onClick={() => setRetry(value => value + 1)}>Tentar novamente</Button></AlertDescription></Alert>}<div className={accountId ? "grid min-w-0 items-start gap-4 lg:grid-cols-2" : "min-w-0"}>
    {accountId && <Card className="min-w-0">
      <CardHeader><CardTitle><h2>Gastos por categoria</h2></CardTitle><CardDescription>Despesas do período com descontos de estornos.</CardDescription></CardHeader>
      <CardContent className="min-h-40" aria-busy={loading}>{loading ? <ChartSkeleton variant="amount" /> : <AmountFinanceChart rows={categories} currency="BRL" />}</CardContent>
    </Card>}
    <Card className="min-w-0">
      <CardHeader><CardTitle><h2>Gastos por meio de pagamento</h2></CardTitle><CardDescription>Participação no valor bruto gasto no período, antes de estornos.</CardDescription></CardHeader>
      <CardContent aria-busy={loading}>
        {loading ? <ChartSkeleton donut /> : <ExpenseDonutChart rows={methods} currency="BRL" groupLabel="meio de pagamento" totalLabel="Gastos brutos" />}
        <div className="min-h-32">{loading ? <ListSkeleton compact rows={4} className="gap-3" rowClassName="h-5 min-h-5 py-0" /> : total > 0n && <ul className="grid gap-3 text-sm">
          {methods.map(row => {
            const basisPoints = (BigInt(row.amountMinor) * 10000n + total / 2n) / total;
            return <li key={row.label} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="flex items-center gap-2"><span aria-hidden="true" className="size-2.5 rounded-full" style={{ backgroundColor: row.fill }} />{row.label}</span>
              <span className="break-words font-mono tabular-nums">{formatMinor(row.amountMinor, "BRL")} · {basisPoints === 0n ? "< 0,01%" : <AnimatedPercentage value={Number(basisPoints) / 100} />}</span>
            </li>;
          })}
        </ul>}</div>
      </CardContent>
    </Card>
  </div></>;
}
