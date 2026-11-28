import { AnimatedPercentage } from "./animated-percentage";
import { formatCurrencyMinor } from "./finance-format";

export function CategorySpendingList({ rows, currency }: {
  rows: { categoryId: string | null; categoryName: string | null; expenseMinor: string }[];
  currency: string;
}) {
  const total = rows.reduce((sum, row) => sum + BigInt(row.expenseMinor), 0n);
  if (!rows.length) return <p className="text-sm text-muted-foreground">Sem despesas por categoria neste período.</p>;

  return <>
    <ul className="grid gap-3">{rows.map(item => {
      const amount = BigInt(item.expenseMinor);
      const share = total > 0n ? Number((amount * 10000n) / total) / 100 : null;
      return <li key={item.categoryId ?? "sem-categoria"} className="grid gap-1.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
          <span className="min-w-0 [overflow-wrap:anywhere]">{item.categoryName ?? "Sem categoria"}</span>
          <span className="min-w-0 font-mono text-xs tabular-nums [overflow-wrap:anywhere]">{formatCurrencyMinor(item.expenseMinor, currency)} <span className="text-muted-foreground">{share === null ? "—" : <AnimatedPercentage value={share} />}</span></span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true"><div className="share-bar h-full w-full rounded-full bg-primary" style={{ transform: `scaleX(${Math.max(0, Math.min(100, share ?? 0)) / 100})` }} /></div>
      </li>;
    })}</ul>
    {rows.some(item => BigInt(item.expenseMinor) < 0n) && <p className="mt-3 text-xs text-muted-foreground">Valores negativos não aparecem nas barras.</p>}
  </>;
}
