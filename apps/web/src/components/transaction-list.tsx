"use client";

import { useMemo, useState } from "react";
import { ArrowDownIcon, ArrowDownLeftIcon, ArrowUpRightIcon, ChevronRightIcon, CircleCheckIcon, SearchIcon } from "lucide-react";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { formatDate, formatMinor } from "@/components/finance-format";
import type { TransactionOption } from "@/components/workspace-types";

type Filter = "all" | "income" | "expense";
type Props = {
  rows: TransactionOption[];
  empty?: string;
  transactionActions?: {
    correct: (transaction: TransactionOption) => void;
    reverse: (transaction: TransactionOption) => void;
  };
};

const incomeKinds = new Set(["income", "cashback", "refund"]);
const expenseKinds = new Set(["expense"]);

function kindLabel(kind: string) {
  const labels: Record<string, string> = {
    income: "Receita", expense: "Despesa", transfer: "Transferência", purchase: "Compra parcelada",
    cashback: "Cashback", refund: "Reembolso", payment: "Pagamento de fatura", reversal: "Estorno",
  };
  return labels[kind] ?? "Movimentação";
}

function formatAmount(row: TransactionOption) {
  if (row.entries?.length) return row.entries.map(entry => formatMinor(entry.amountMinor, entry.currency)).join(" / ");
  return row.allocations?.map(allocation => formatMinor(allocation.amountMinor, "BRL")).join(" / ") ?? "";
}

function amountTone(row: TransactionOption) {
  return incomeKinds.has(row.kind) ? "text-success" : expenseKinds.has(row.kind) ? "text-destructive" : "text-foreground";
}

export function visibleTransactions(rows: TransactionOption[], showCancelled = false) {
  return showCancelled ? rows : rows.filter(row => !row.reversalOfTransactionId && !row.reversedByTransactionIds?.length);
}

export function filterTransactions(rows: TransactionOption[], { query = "", filter = "all", accountId = "", categoryId = "" }: { query?: string; filter?: Filter; accountId?: string; categoryId?: string }) {
  return rows.filter(row => {
    if (accountId && !row.entries?.some(entry => entry.accountId === accountId)) return false;
    if (categoryId && !row.allocations?.some(item => item.categoryId === categoryId)) return false;
    if (filter === "income" && !incomeKinds.has(row.kind)) return false;
    if (filter === "expense" && !expenseKinds.has(row.kind)) return false;
    const amounts = (row.entries ?? []).map(entry => `${entry.amountMinor} ${formatMinor(entry.amountMinor, entry.currency)}`);
    const text = [row.description, row.counterpartyName, kindLabel(row.kind), ...(row.allocations ?? []).map(item => item.categoryName), ...amounts].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");
    return text.includes(query.trim().toLocaleLowerCase("pt-BR"));
  });
}

export function TransactionList({ rows, empty = "Seus lançamentos aparecerão aqui depois de registrados.", transactionActions }: Props) {
  const [showCancelled, setShowCancelled] = useState(false);
  const visibleRows = useMemo(() => visibleTransactions(rows, showCancelled), [rows, showCancelled]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const accounts = [...new Map(rows.flatMap(row => (row.entries ?? []).map(entry => [entry.accountId, entry.accountName] as const))).entries()];
  const categories = [...new Map(rows.flatMap(row => (row.allocations ?? []).filter(item => item.categoryId).map(item => [item.categoryId!, item.categoryName ?? "Sem categoria"] as const))).entries()];
  const filteredRows = useMemo(() => filterTransactions(visibleRows, { query, filter, accountId, categoryId }), [filter, query, visibleRows, accountId, categoryId]);
  const grouped = useMemo(() => {
    const groups = new Map<string, TransactionOption[]>();
    for (const row of filteredRows) groups.set(row.occurredOn, [...(groups.get(row.occurredOn) ?? []), row]);
    return [...groups.entries()];
  }, [filteredRows]);
  const counts = {
    all: visibleRows.length,
    income: visibleRows.filter(row => incomeKinds.has(row.kind)).length,
    expense: visibleRows.filter(row => expenseKinds.has(row.kind)).length,
  };

  return <section aria-label="Extrato de transações" className="flex flex-col gap-4">
    <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={showCancelled} onChange={event => setShowCancelled(event.target.checked)} />Mostrar cancelados</label>
    <div className="flex flex-col gap-3 rounded-xl bg-card p-3 sm:p-4">
      <label className="relative block">
        <SearchIcon aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <span className="sr-only">Buscar transação, categoria ou valor</span>
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar transação, categoria ou valor..." className="h-10 w-full rounded-lg border-0 bg-muted pl-10 pr-3 text-sm shadow-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring" />
      </label>
      <div className="flex max-w-full gap-2 overflow-x-auto pb-1" role="group" aria-label="Filtrar transações">
        {(["all", "income", "expense"] as const).map(value => <Button key={value} type="button" size="sm" variant={filter === value ? "secondary" : "outline"} className="h-8 shrink-0 gap-2 px-3 text-xs" aria-pressed={filter === value} onClick={() => setFilter(value)}>
          {value === "income" ? <ArrowDownIcon aria-hidden="true" className="text-success" /> : value === "expense" ? <ArrowUpRightIcon aria-hidden="true" className="text-destructive" /> : null}
          {value === "all" ? "Todas" : value === "income" ? "Receitas" : "Despesas"}
          <span className="rounded bg-background/70 px-1 font-mono text-[10px]">{counts[value]}</span>
        </Button>)}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <NativeSelect aria-label="Filtrar por conta" value={accountId} onChange={event => setAccountId(event.target.value)} className="w-full sm:w-48"><NativeSelectOption value="">Todas as contas</NativeSelectOption>{accounts.map(([id, name]) => <NativeSelectOption key={id} value={id}>{name}</NativeSelectOption>)}</NativeSelect>
        <NativeSelect aria-label="Filtrar por categoria" value={categoryId} onChange={event => setCategoryId(event.target.value)} className="w-full sm:w-48"><NativeSelectOption value="">Todas as categorias</NativeSelectOption>{categories.map(([id, name]) => <NativeSelectOption key={id} value={id}>{name}</NativeSelectOption>)}</NativeSelect>
        {(query || filter !== "all" || accountId || categoryId) && <Button variant="ghost" onClick={() => { setQuery(""); setFilter("all"); setAccountId(""); setCategoryId(""); }}>Limpar filtros</Button>}
      </div>
    </div>

    <div className="rounded-xl bg-card p-3 ring-1 ring-foreground/10 sm:p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0"><p className="font-mono text-[11px] tracking-widest text-muted-foreground">TRANSAÇÕES</p><p className="text-xs text-muted-foreground">Extrato consolidado</p></div>
        <p className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{filteredRows.length} {filteredRows.length === 1 ? "transação listada" : "transações listadas"}</p>
      </div>
    </div>

    {!filteredRows.length ? <Empty><EmptyDescription>{rows.length ? "Nenhuma transação corresponde à busca." : empty}</EmptyDescription></Empty> : <>
      <div className="flex flex-col gap-4 xl:hidden">
        {grouped.map(([date, items]) => <section key={date} aria-label={formatDate(date)}>
          <div className="mb-1 flex items-center justify-between gap-2 px-1"><h3 className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{formatDate(date)}</h3><span className="font-mono text-[11px] text-muted-foreground">{items.length} {items.length === 1 ? "item" : "itens"}</span></div>
          <ul className="flex flex-col gap-1.5">{items.map(row => <TransactionCard key={row.id} row={row} rows={rows} transactionActions={transactionActions} />)}</ul>
        </section>)}
      </div>

      <div className="hidden overflow-x-auto rounded-xl bg-card xl:block">
        <div className="grid min-w-[960px] grid-cols-[minmax(80px,0.7fr)_minmax(190px,2fr)_minmax(130px,1fr)_minmax(125px,1fr)_minmax(125px,1fr)_minmax(115px,1fr)_auto] items-center gap-3 border-b border-border bg-muted/40 px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          <span>Data</span><span>Descrição</span><span>Categoria</span><span>Conta</span><span>Status</span><span className="text-right">Valor</span><span className="sr-only">Ações</span>
        </div>
        <ul>{filteredRows.map(row => <TransactionTableRow key={row.id} row={row} rows={rows} transactionActions={transactionActions} />)}</ul>
        <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">Mostrando {filteredRows.length} de {rows.length} transações</div>
      </div>
    </>}
  </section>;
}

function TransactionCard({ row, rows, transactionActions }: { row: TransactionOption; rows: TransactionOption[]; transactionActions?: Props["transactionActions"] }) {
  const category = row.allocations?.find(item => item.categoryName)?.categoryName;
  return <li id={`transaction-${row.id}`} className="min-w-0 rounded-xl bg-card p-3 shadow-sm">
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">{incomeKinds.has(row.kind) ? <ArrowDownLeftIcon aria-hidden="true" className="text-success" /> : <ArrowUpRightIcon aria-hidden="true" className="text-destructive" />}</div>
        <div className="min-w-0"><p className="truncate text-sm font-medium">{row.description}</p><div className="mt-1 flex flex-wrap items-center gap-1.5"><Badge variant="outline" className="h-5 rounded px-1.5 py-0 font-mono text-[10px] uppercase tracking-wide">{category ?? kindLabel(row.kind)}</Badge>{row.reviewStatus === "needs_review" ? <Badge variant="outline" className="h-5 rounded px-1.5 py-0 text-[10px]">Precisa revisar</Badge> : <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"><CircleCheckIcon aria-hidden="true" className="size-3 text-success" />Confirmado</span>}</div></div>
      </div>
      <div className="flex max-w-[48%] min-w-0 shrink-0 items-center gap-1"><div className="min-w-0 break-words text-right"><p className={`font-mono text-sm font-medium tabular-nums ${amountTone(row)}`}>{formatAmount(row)}</p><p className="font-mono text-[10px] text-muted-foreground">{formatDate(row.occurredOn)}</p></div><ChevronRightIcon aria-hidden="true" className="size-4 text-muted-foreground" /></div>
    </div>
    {(transactionActions || row.notes) && <details className="mt-2 border-t border-border pt-1 text-xs"><summary className="flex min-h-9 cursor-pointer items-center text-muted-foreground">Detalhes do lançamento</summary><div className="grid gap-3 pb-2 text-muted-foreground">{row.notes && <p className="whitespace-pre-wrap">{row.notes}</p>}<TransactionMeta row={row} />{transactionActions && <ActionButtons row={row} rows={rows} actions={transactionActions} />}</div></details>}
  </li>;
}

function TransactionTableRow({ row, rows, transactionActions }: { row: TransactionOption; rows: TransactionOption[]; transactionActions?: Props["transactionActions"] }) {
  const category = row.allocations?.find(item => item.categoryName)?.categoryName ?? "Sem categoria";
  const account = row.entries?.[0]?.accountName ?? "—";
  return <li id={`transaction-${row.id}`} className="grid min-w-[960px] grid-cols-[minmax(80px,0.7fr)_minmax(190px,2fr)_minmax(130px,1fr)_minmax(125px,1fr)_minmax(125px,1fr)_minmax(115px,1fr)_auto] items-center gap-3 border-b border-border px-4 py-3 text-sm last:border-b-0">
    <span className="font-mono text-xs text-muted-foreground">{formatDate(row.occurredOn)}</span><div className="min-w-0"><p className="truncate font-medium">{row.description}</p><p className="truncate text-xs text-muted-foreground">{row.counterpartyName ?? kindLabel(row.kind)}</p></div><span className="truncate text-xs text-muted-foreground">{category}</span><span className="truncate text-xs text-muted-foreground">{account}</span><span>{row.reviewStatus === "needs_review" ? <Badge variant="outline">Precisa revisar</Badge> : <Badge variant="secondary" className="text-success"><CircleCheckIcon aria-hidden="true" />Confirmado</Badge>}</span><span className={`text-right font-mono text-xs tabular-nums ${amountTone(row)}`}>{formatAmount(row)}</span><details className="relative"><summary className="flex size-8 cursor-pointer list-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted"><span aria-hidden="true">···</span><span className="sr-only">Detalhes e ações de {row.description}</span></summary><div className="absolute right-0 z-10 mt-1 w-72 rounded-lg bg-popover p-3 shadow-lg ring-1 ring-foreground/15"><TransactionMeta row={row} />{row.notes && <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{row.notes}</p>}{transactionActions && <ActionButtons row={row} rows={rows} actions={transactionActions} />}</div></details>
  </li>;
}

function TransactionMeta({ row }: { row: TransactionOption }) {
  return <div className="grid gap-2">{row.entries?.length ? <div><p className="font-medium text-foreground">Contas movimentadas</p>{row.entries.map((entry, index) => <p key={`${entry.accountId}-${index}`} className="mt-1 flex justify-between gap-2"><span className="truncate">{entry.accountName}</span><span className="shrink-0 tabular-nums">{formatMinor(entry.amountMinor, entry.currency)}</span></p>)}</div> : null}{row.allocations?.length ? <div><p className="font-medium text-foreground">Categorias</p>{row.allocations.map((item, index) => <p key={`${item.categoryId}-${index}`} className="mt-1 flex justify-between gap-2"><span>{item.categoryName ?? "Sem categoria"}</span><span className="tabular-nums">{formatMinor(item.amountMinor, row.entries?.[0]?.currency ?? "BRL")}</span></p>)}</div> : null}{(row.reversalOfTransactionId || row.reversedByTransactionIds?.length) && <div><p className="font-medium text-foreground">Vínculos</p>{row.reversalOfTransactionId && <a className="block min-h-8 pt-2 text-primary underline-offset-4 hover:underline" href={`#transaction-${row.reversalOfTransactionId}`}>Reverte o lançamento {row.reversalOfTransactionId.slice(0, 8)}</a>}{row.reversedByTransactionIds?.map(id => <a key={id} className="block min-h-8 pt-2 text-primary underline-offset-4 hover:underline" href={`#transaction-${id}`}>Revertido pelo lançamento {id.slice(0, 8)}</a>)}</div>}{row.revisions?.length ? <div><p className="font-medium text-foreground">Revisões</p>{row.revisions.map(revision => <p key={revision.id} className="mt-1">Revisão {revision.revisionNumber} · {revision.reason} · {revision.actor} ({revision.source}) · {new Date(revision.createdAt).toLocaleString("pt-BR")}</p>)}</div> : null}</div>;
}

function ActionButtons({ row, rows: _rows, actions }: { row: TransactionOption; rows: TransactionOption[]; actions: NonNullable<Props["transactionActions"]> }) {
  return <div className="mt-2 flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" onClick={() => actions.correct(row)}>Corrigir dados ou categoria</Button>{row.canReverse && <Button type="button" size="sm" variant="outline" onClick={() => actions.reverse(row)}>Cancelar lançamento</Button>}</div>;
}
