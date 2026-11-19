"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { spendingReportResponseSchema, type SpendingReport } from "@finance/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AmountFinanceChart, ExpenseDonutChart } from "./finance-charts";
import { formatMinor } from "./finance-format";

const paymentMethods = {
  credit: { label: "Crédito", fill: "var(--chart-income)" },
  debit: { label: "Débito", fill: "var(--chart-2)" },
  pix: { label: "Pix", fill: "var(--chart-3)" },
  other: { label: "Outros", fill: "var(--chart-4)" },
} satisfies Record<SpendingReport["paymentMethods"][number]["method"], { label: string; fill: string }>;

const percent = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 2 });

export function SpendingBreakdown({ accountId, period: { from, to }, reloadToken }: {
  accountId?: string;
  period: { from: string; to: string };
  reloadToken: number;
}) {
  const router = useRouter();
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ key: string; data: SpendingReport | null }>();
  const query = new URLSearchParams({ from, to, ...(accountId ? { accountId } : {}) }).toString();
  const key = `${query}:${reloadToken}:${retry}`;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/v1/reports/spending?${query}`, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (response.status === 401 && !controller.signal.aborted) router.replace("/login");
        if (!response.ok) throw new Error();
        const envelope = spendingReportResponseSchema.parse(await response.json());
        if (!envelope.ok) throw new Error(envelope.error.message);
        if (!controller.signal.aborted) setResult({ key, data: envelope.data });
      })
      .catch(() => { if (!controller.signal.aborted) setResult({ key, data: null }); });
    return () => controller.abort();
  }, [key, query, router]);

  if (result?.key !== key) return <p role="status" className="text-sm text-muted-foreground">Carregando gastos…</p>;
  if (!result.data) return <Alert variant="destructive">
    <AlertDescription className="flex flex-wrap items-center gap-3">Não foi possível carregar os gastos.<Button variant="outline" onClick={() => setRetry(value => value + 1)}>Tentar novamente</Button></AlertDescription>
  </Alert>;

  const categories = result.data.categories.map(row => ({ label: row.categoryName ?? "Sem categoria", amountMinor: row.amountMinor }));
  const methods = result.data.paymentMethods.map(row => ({ ...paymentMethods[row.method], amountMinor: row.amountMinor }));
  const total = methods.reduce((sum, row) => sum + BigInt(row.amountMinor), 0n);
  return <div className={accountId ? "grid min-w-0 items-start gap-4 lg:grid-cols-2" : "min-w-0"}>
    {accountId && <Card className="min-w-0">
      <CardHeader><CardTitle><h2>Gastos por categoria</h2></CardTitle><CardDescription>Despesas do período com descontos de estornos.</CardDescription></CardHeader>
      <CardContent><AmountFinanceChart rows={categories} currency="BRL" /></CardContent>
    </Card>}
    <Card className="min-w-0">
      <CardHeader><CardTitle><h2>Gastos por meio de pagamento</h2></CardTitle><CardDescription>Participação no valor bruto gasto no período, antes de estornos.</CardDescription></CardHeader>
      <CardContent>
        <ExpenseDonutChart rows={methods} currency="BRL" groupLabel="meio de pagamento" totalLabel="Gastos brutos" />
        {total > 0n && <ul className="grid gap-3 text-sm">
          {methods.map(row => {
            const basisPoints = (BigInt(row.amountMinor) * 10000n + total / 2n) / total;
            return <li key={row.label} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="flex items-center gap-2"><span aria-hidden="true" className="size-2.5 rounded-full" style={{ backgroundColor: row.fill }} />{row.label}</span>
              <span className="break-words font-mono tabular-nums">{formatMinor(row.amountMinor, "BRL")} · {basisPoints === 0n ? "< 0,01%" : percent.format(Number(basisPoints) / 10000)}</span>
            </li>;
          })}
        </ul>}
      </CardContent>
    </Card>
  </div>;
}
