"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import type { CategoryReport } from "@finance/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { AppShell } from "./app-shell";
import { recentMonths } from "./finance-chart-data";
import { DashboardOverview } from "./dashboard-overview";
import { TransactionList } from "./transaction-list";
import { ReportsDashboard, type ReportRange } from "./reports-dashboard";
import { ActionDialog } from "./action-dialog";
import { actionLabels, type Section, type Action, type AccountOption, type CategoryOption, type TransactionOption, type ExpenseForecastOption, type StatementOption, type References, type ReportData } from "./workspace-types";
import { useRouter } from "next/navigation";
import { formatDate, formatMinor, parseMajorToMinor, todayCivil, reportPeriod } from "./finance-format";

const titles: Record<Section, { title: string; intro: string }> = {
  new: { title: "Nova transação", intro: "Registre uma receita ou despesa." },
  overview: { title: "Visão geral", intro: "Uma visão simples do que está acontecendo nas suas contas." },
  accounts: { title: "Contas", intro: "Instituições e contas que fazem parte da sua vida financeira." },
  cards: { title: "Cartões", intro: "Acompanhe limites, compras e próximos vencimentos." },
  entries: { title: "Lançamentos", intro: "Histórico registrado e previsões avulsas em áreas separadas." },
  statements: { title: "Faturas", intro: "Fechamentos, parcelas e pagamentos dos seus cartões." },
  reports: { title: "Relatórios", intro: "Receitas e despesas por período, em reais." },
};

function transactionKindLabel(kind: string) {
  switch (kind) {
    case "income": return "Receita";
    case "expense": return "Despesa";
    case "transfer": return "Transferência";
    case "refund": return "Estorno";
    case "adjustment": return "Ajuste";
    default: return kind;
  }
}

function statementStatusLabel(status: string) {
  switch (status) {
    case "open": return "Aberta";
    case "closed": return "Fechada";
    case "paid": return "Quitada";
    case "partially_paid": return "Parcialmente paga";
    case "overdue": return "Vencida";
    default: return status;
  }
}

export function Workspace({ section }: { section: Section }) {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [csrf, setCsrf] = useState("");
  const [form, setForm] = useState<Action | null>(section === "new" ? "expense" : null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [range, setRange] = useState<ReportRange>("month");
  const [references, setReferences] = useState<References>({ accounts: [], categories: [], transactions: [], statements: [], institutions: [] });
  const [historyPeriod, setHistoryPeriod] = useState(() => reportPeriod("month"));
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState("");
  const [report, setReport] = useState<{ range: string; data: ReportData } | null>(null);
  const [reportError, setReportError] = useState("");
  const [reportLoading, setReportLoading] = useState(true);
  const [reportReload, setReportReload] = useState(0);
  const [analytics, setAnalytics] = useState<{ range: string; series: ReportData[]; categories: CategoryReport[] } | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const [pendingRequest, setPendingRequest] = useState<{ signature: string; key: string } | null>(null);
  const [pendingPreview, setPendingPreview] = useState<{ signature: string; data: Record<string, unknown> } | null>(null);
  const [forecasts, setForecasts] = useState<ExpenseForecastOption[]>([]);
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionOption | null>(null);
  const [selectedForecast, setSelectedForecast] = useState<ExpenseForecastOption | null>(null);
  const [pendingReverseReview, setPendingReverseReview] = useState<{ signature: string; reason: string; replacement: Record<string, unknown> | null } | null>(null);

  useEffect(() => {
    setForm(section === "new" ? "expense" : null);
    setPendingPreview(null); setPendingReverseReview(null); setSelectedTransaction(null); setSelectedForecast(null);
  }, [section]);

  useEffect(() => {
    fetch("/api/auth/session", { cache: "no-store" }).then(response => response.json()).then(result => {
      setAuthenticated(result.data.authenticated); setCsrf(result.data.csrfToken ?? "");
      if (!result.data.authenticated) router.replace("/login");
    }).catch(() => { setAuthenticated(false); router.replace("/login"); });
  }, [router]);

  useEffect(() => {
    if (!authenticated) return;
    let cancelled = false;
    setDataLoading(true); setDataError("");
    const today = todayCivil();
    const year = Number(today.slice(0, 4));
    const statementFrom = historyPeriod.from;
    const statementTo = section === "statements" ? historyPeriod.to : `${year + 2}-12-31`;
    const transactionFrom = section === "entries" ? historyPeriod.from : "0001-01-01";
    const transactionTo = section === "entries" ? historyPeriod.to : today;
    const forecastFrom = historyPeriod.from;
    const forecastTo = historyPeriod.to;
    Promise.all([
      fetch("/api/v1/accounts", { cache: "no-store" }), fetch("/api/v1/categories", { cache: "no-store" }),
      fetch(`/api/v1/transactions?from=${transactionFrom}&to=${transactionTo}`, { cache: "no-store" }),
      fetch(`/api/v1/statements?from=${statementFrom}&to=${statementTo}&includePending=true`, { cache: "no-store" }),
      fetch("/api/v1/institutions", { cache: "no-store" }),
      fetch(`/api/v1/expense-forecasts?from=${forecastFrom}&to=${forecastTo}&includePending=true`, { cache: "no-store" }),
    ]).then(async ([accounts, categories, transactions, statements, institutions, expenseForecasts]) => {
      const responses = await Promise.all([accounts.json(), categories.json(), transactions.json(), statements.json(), institutions.json(), expenseForecasts.json()]);
      if ([accounts, categories, transactions, statements, institutions, expenseForecasts].some(response => response.status === 401)) { router.replace("/login"); return; }
      if ([accounts, categories, transactions, statements, institutions, expenseForecasts].some(response => response.status === 403)) throw new Error("Você não tem permissão para consultar estes dados.");
      if (!accounts.ok || !categories.ok || !transactions.ok || !statements.ok || !institutions.ok || !expenseForecasts.ok) throw new Error("Não foi possível carregar os dados. Tente novamente.");
      if (cancelled) return;
      setReferences({ accounts: responses[0].data, categories: responses[1].data, transactions: responses[2].data, statements: responses[3].data, institutions: responses[4].data });
      setForecasts(responses[5].data);
    }).catch(error => { if (!cancelled) setDataError(error instanceof Error && error.message.startsWith("Você não tem permissão") ? error.message : "Não foi possível carregar os dados. Tente novamente."); })
      .finally(() => { if (!cancelled) setDataLoading(false); });
    return () => { cancelled = true; };
  }, [authenticated, reloadToken, router, historyPeriod, section]);

  useEffect(() => {
    if (!authenticated) return;
    const controller = new AbortController();
    const { from, to } = reportPeriod(range);
    setReportLoading(true); setReportError("");
    fetch(`/api/v1/reports/summary?from=${from}&to=${to}`, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (response.status === 401) { router.replace("/login"); return null; }
        if (!response.ok) throw new Error(response.status === 403 ? "Você não tem permissão para consultar este relatório." : "Não foi possível carregar o relatório. Tente novamente.");
        const result = await response.json();
        return result.data as ReportData;
      })
      .then(data => { if (!controller.signal.aborted && data) setReport({ range, data }); })
      .catch(error => { if (!controller.signal.aborted) setReportError(error instanceof Error && error.message.startsWith("Você não tem permissão") ? error.message : "Não foi possível carregar o relatório. Tente novamente."); })
      .finally(() => { if (!controller.signal.aborted) setReportLoading(false); });
    return () => controller.abort();
  }, [authenticated, range, reloadToken, reportReload, router]);

  useEffect(() => {
    if (!authenticated || (section !== "overview" && section !== "reports")) return;
    const controller = new AbortController();
    const { from, to } = reportPeriod(range);
    const urls = [
      `/api/v1/reports/categories?from=${from}&to=${to}`,
      `/api/v1/reports/monthly-series?from=${recentMonths(to, range === "year" ? 12 : 6)[0]!.from}&to=${to}`,
    ];
    setAnalyticsLoading(true); setAnalyticsError("");
    Promise.all(urls.map(url => fetch(url, { cache: "no-store", signal: controller.signal })))
      .then(async responses => {
        if (responses.some(response => response.status === 401)) { router.replace("/login"); return null; }
        if (responses.some(response => !response.ok)) throw new Error("Não foi possível carregar os gráficos.");
        return Promise.all(responses.map(response => response.json()));
      })
      .then(results => {
        if (!controller.signal.aborted && results) setAnalytics({ range, categories: results[0].data as CategoryReport[], series: results[1].data as ReportData[] });
      })
      .catch(() => { if (!controller.signal.aborted) setAnalyticsError("Não foi possível carregar os gráficos. Tente novamente."); })
      .finally(() => { if (!controller.signal.aborted) setAnalyticsLoading(false); });
    return () => controller.abort();
  }, [authenticated, section, range, reloadToken, reportReload, router]);

  const currentAnalytics = analytics?.range === range && !analyticsError ? analytics : null;
  const currentReport = report?.range === range && !reportError ? report.data : null;

  const current = titles[section];
  const openTransactionAction = (action: "correct" | "reverse", transaction: TransactionOption) => { setSelectedTransaction(transaction); setSelectedForecast(null); setPendingReverseReview(null); setPendingPreview(null); setForm(action); };
  const openForecastAction = (action: "realizeForecast" | "cancelForecast", forecast: ExpenseForecastOption) => { setSelectedForecast(forecast); setSelectedTransaction(null); setPendingPreview(null); setForm(action); };
  const closeDialog = useCallback(() => { setForm(null); setMessage(""); setPendingPreview(null); setPendingReverseReview(null); setSelectedTransaction(null); setSelectedForecast(null); if (section === "new") router.push("/entries"); }, [section, router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!form) return;
    setBusy(true); setMessage("");
    const formData = new FormData(event.currentTarget);
    const entries = Object.fromEntries(formData.entries());
    const body: Record<string, unknown> = { ...entries };
    for (const key of ["amountMinor", "totalAmountMinor", "openingBalanceMinor", "creditLimitMinor"]) {
      const value = body[key];
      if (typeof value === "string" && value) {
        const minor = parseMajorToMinor(value);
        if (minor === null) { setBusy(false); setMessage("Use um valor válido, com até duas casas decimais e sem separador de milhar."); return; }
        body[key] = minor;
      } else if (key === "creditLimitMinor") body[key] = null;
    }
    const readAllocations = () => {
      const categoryIds = formData.getAll("allocationCategoryId").map(value => String(value));
      const splitAmounts = formData.getAll("allocationAmount").map(value => String(value));
      const allocations = categoryIds.map((categoryId, index) => ({ categoryId: categoryId || null, amountMinor: parseMajorToMinor(splitAmounts[index] ?? "") }));
      if (allocations.some(allocation => allocation.amountMinor === null || BigInt(allocation.amountMinor) <= 0n)) return null;
      return allocations.map(allocation => ({ categoryId: allocation.categoryId, amountMinor: allocation.amountMinor }));
    };
    const needsAllocations = form === "expense" || form === "purchase"
      || (form === "correct" && formData.get("replaceCategories") === "on")
      || (form === "reverse" && formData.get("replacementKind") === "expense");
    const allocations = needsAllocations ? readAllocations() : null;
    if (needsAllocations && !allocations) { setBusy(false); setMessage("Informe valores positivos para cada categoria."); return; }
    if (form === "expense" || form === "purchase") body.allocations = allocations;
    if (form === "correct") {
      const metadata = Object.fromEntries(["description", "counterpartyName", "notes", "reviewStatus"].map(key => [key, key === "counterpartyName" || key === "notes" ? (body[key] || null) : body[key]]));
      body.transactionId = selectedTransaction?.id;
      body.reason = entries.reason;
      body.metadata = metadata;
      if (formData.get("replaceCategories") === "on") body.allocations = allocations;
      else delete body.allocations;
      for (const key of ["description", "counterpartyName", "notes", "reviewStatus", "replaceCategories"]) delete body[key];
    }
    if (form === "reverse") {
      const replacementKind = String(body.replacementKind ?? "");
      const replacement: Record<string, unknown> | null = replacementKind ? {
        kind: replacementKind, occurredOn: body.replacementOn, description: body.replacementDescription,
        source: "manual", reviewStatus: body.replacementReviewStatus,
        ...(replacementKind === "income" ? { accountId: body.replacementAccountId, amountMinor: body.amountMinor, categoryId: body.replacementCategoryId || null } : {}),
        ...(replacementKind === "expense" ? { accountId: body.replacementAccountId, amountMinor: body.amountMinor, paymentMethod: body.replacementPaymentMethod, allocations } : {}),
        ...(replacementKind === "transfer" ? { fromAccountId: body.replacementFromAccountId, toAccountId: body.replacementToAccountId, amountMinor: body.amountMinor } : {}),
      } : null;
      const amountIsRequired = replacementKind !== "";
      if (amountIsRequired && (typeof body.amountMinor !== "string" || !/^[1-9]\d*$/.test(body.amountMinor))) { setBusy(false); setMessage("Informe um valor positivo para a substituição."); return; }
      Object.assign(body, { transactionId: selectedTransaction?.id, reason: entries.reason, occurredOn: entries.occurredOn, ...(replacement ? { replacement } : {}) });
      for (const key of ["replacementKind", "replacementOn", "replacementDescription", "replacementReviewStatus", "replacementAccountId", "replacementCategoryId", "replacementPaymentMethod", "replacementFromAccountId", "replacementToAccountId", "amountMinor", "allocationCategoryId", "allocationAmount"]) delete body[key];
      if (pendingReverseReview?.signature !== JSON.stringify({ path: `/api/v1/transactions/reverse`, body })) {
        const signature = JSON.stringify({ path: "/api/v1/transactions/reverse", body });
        setPendingReverseReview({ signature, reason: String(entries.reason ?? ""), replacement }); setBusy(false); return;
      }
    }
    if (["income", "expense", "transfer", "purchase", "cashback", "refund", "payment", "realizeForecast"].includes(form)) body.source = "manual";
    for (const key of ["institutionId", "parentId", "categoryId"]) if (body[key] === "") body[key] = null;
    for (const key of ["postedOn", "counterpartyName", "notes"]) if (body[key] === "") body[key] = null;
    if (body.cardStatementId === "") delete body.cardStatementId;
    delete body.allocationCategoryId; delete body.allocationAmount;
    if (form === "institution") Object.assign(body, { name: entries.name });
    if (form === "category") Object.assign(body, { name: entries.name, type: entries.type, parentId: entries.parentId || null });
    for (const key of ["installmentCount", "closingDay", "dueDay"]) if (typeof body[key] === "string" && body[key] !== "") body[key] = Number(body[key]);
    if (form === "account" && body.type === "credit_card") {
      body.cardSettings = {
        creditLimitMinor: body.creditLimitMinor ?? null,
        closingDay: body.closingDay === "" ? undefined : body.closingDay,
        dueDay: body.dueDay === "" ? undefined : body.dueDay,
        billingTimezone: "America/Sao_Paulo",
        billingMode: "manual",
      };
      delete body.creditLimitMinor; delete body.closingDay; delete body.dueDay;
    }
    if (form === "configureCard") delete body.description;
    const endpoint: Record<Action, string> = {
      institution: "/api/v1/institutions", account: "/api/v1/accounts", configureCard: "/api/v1/cards/configuration", category: "/api/v1/categories",
      income: "/api/v1/transactions/income", expense: "/api/v1/transactions/expense", transfer: "/api/v1/transactions/transfer",
      purchase: "/api/v1/transactions/credit-purchase", cashback: "/api/v1/transactions/cashback", refund: "/api/v1/transactions/refund",
      payment: "/api/v1/statements/payment", close: "/api/v1/statements/close",
      forecast: "/api/v1/expense-forecasts", realizeForecast: `/api/v1/expense-forecasts/${selectedForecast?.id}/realize`,
      cancelForecast: `/api/v1/expense-forecasts/${selectedForecast?.id}/cancel`, correct: "/api/v1/transactions/correct", reverse: "/api/v1/transactions/reverse",
    };
    const path = endpoint[form];
    const operation: Record<string, string> = { income: "income", expense: "expense", transfer: "transfer", purchase: "credit_purchase", cashback: "cashback", refund: "refund", payment: "statement_payment" };
    const previewBody = operation[form] ? { ...body, operation: operation[form] } : null;
    const signature = JSON.stringify({ path, body });
    if (previewBody && pendingPreview?.signature !== signature) {
      try {
        const response = await fetch("/api/v1/transactions/preview", { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": csrf }, body: JSON.stringify(previewBody) });
        const result = await response.json().catch(() => null);
        if (!response.ok) { setMessage(result?.error?.message ?? "Não foi possível validar esta operação."); return; }
        setPendingPreview({ signature, data: result.data });
        return;
      } catch { setMessage("Falha de conexão ao validar. Revise os dados e tente novamente."); return; }
      finally { setBusy(false); }
    }
    const idempotencyKey = pendingRequest?.signature === signature ? pendingRequest.key : crypto.randomUUID();
    setPendingRequest({ signature, key: idempotencyKey });
    try {
      const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": csrf, "idempotency-key": idempotencyKey }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => null);
      if (!response.ok) { setMessage(result?.error?.message ?? "Não foi possível salvar."); return; }
      setPendingRequest(null); setPendingPreview(null); setPendingReverseReview(null); setForm(null); setSelectedForecast(null); setSelectedTransaction(null); setMessage("Registro salvo."); setReloadToken(value => value + 1); if (section === "new") router.push("/entries"); else router.refresh();
    } catch { setMessage("Falha de conexão. Tente novamente; a mesma chave de idempotência será reutilizada."); }
    finally { setBusy(false); }
  }

  if (!authenticated) return <main className="grid min-h-dvh place-items-center text-sm text-muted-foreground">Preparando seu espaço…</main>;

  return <AppShell createDisabled={dataLoading || Boolean(dataError)} section={section} title={current.title} description={current.intro}
    onCreate={action => { setSelectedForecast(null); setSelectedTransaction(null); setForm(action); }}
    onSignOut={async () => { await fetch("/api/auth/session", { method: "DELETE", headers: { "x-csrf-token": csrf } }); router.replace("/login"); }}>
        {dataError && <Alert variant="destructive" className="mb-5"><AlertDescription>{dataError}{!dataError.startsWith("Você não tem permissão") && <Button variant="outline" onClick={() => setReloadToken(value => value + 1)}>Tentar novamente</Button>}</AlertDescription></Alert>}
        {message && !form && <Alert role="status" className="mb-5"><AlertDescription>{message}</AlertDescription></Alert>}
        {(section === "overview" || section === "reports") && analyticsError && <Alert variant="destructive" className="mb-5"><AlertDescription>{analyticsError}<Button variant="outline" onClick={() => setReportReload(value => value + 1)}>Tentar novamente</Button></AlertDescription></Alert>}
        {(section === "overview" || section === "reports") && reportError && <Alert variant="destructive" className="mb-5"><AlertDescription>{reportError}{!reportError.startsWith("Você não tem permissão") && <Button variant="outline" onClick={() => setReportReload(value => value + 1)}>Tentar novamente</Button>}</AlertDescription></Alert>}
        {(section === "overview" || section === "reports") && reportLoading && <p role="status" className="mb-3 text-sm text-muted-foreground">{report ? "Atualizando relatório…" : "Carregando relatório…"}</p>}
        {dataLoading ? <div role="status" className="grid gap-4"><span className="sr-only">Carregando seus dados</span><Skeleton className="h-36 w-full" /><Skeleton className="h-52 w-full" /></div> : dataError ? null : <>
          {section === "overview" && <DashboardOverview series={currentAnalytics?.series ?? []} categories={currentAnalytics?.categories ?? []} analyticsLoading={analyticsLoading} setForm={setForm} range={range} setRange={value => setRange(value as ReportRange)} references={references} report={currentReport} reportError={Boolean(reportError)} />}
          {section === "accounts" && <ResourceSection title="Suas contas" detail="Saldos derivados do saldo inicial e das movimentações registradas." action="account" setForm={setForm} rows={references.accounts.filter(account => account.type !== "credit_card")} />}
          {section === "cards" && <ResourceSection title="Seus cartões" detail="Cartões, limites disponíveis e configurações de fechamento." action="account" secondaryAction="configureCard" setForm={setForm} rows={references.accounts.filter(account => account.type === "credit_card")} />}
          {(section === "entries" || section === "statements") && <div className="mb-4 flex flex-wrap gap-3">
            <label className="grid gap-1 text-sm">De<input className="min-h-11 rounded-md border border-border bg-card px-3" type="date" value={historyPeriod.from} max={historyPeriod.to} onChange={event => { if (event.target.value) setHistoryPeriod(period => ({ ...period, from: event.target.value })); }} /></label>
            <label className="grid gap-1 text-sm">Até<input className="min-h-11 rounded-md border border-border bg-card px-3" type="date" value={historyPeriod.to} min={historyPeriod.from} onChange={event => { if (event.target.value) setHistoryPeriod(period => ({ ...period, to: event.target.value })); }} /></label>
          </div>}
          {section === "entries" && <>
            <TransactionList rows={references.transactions} transactionActions={{ correct: transaction => openTransactionAction("correct", transaction), reverse: transaction => openTransactionAction("reverse", transaction) }} />
            <ExpenseForecasts forecasts={forecasts} references={references} setForm={setForm} onRealize={forecast => openForecastAction("realizeForecast", forecast)} onCancel={forecast => openForecastAction("cancelForecast", forecast)} />
          </>}
          {section === "statements" && <ResourceSection title="Faturas dos cartões" detail="Faturas, parcelas, créditos e pagamentos." action="close" setForm={setForm} rows={references.statements} />}
          {section === "reports" && !reportError && <ReportsDashboard series={currentAnalytics?.series ?? []} categories={currentAnalytics?.categories ?? []} analyticsLoading={analyticsLoading} range={range} onRangeChange={setRange} report={currentReport} />}
        </>}
    {form && (section !== "new" || (!dataLoading && !dataError)) && <ActionDialog presentation={section === "new" ? "inline" : "dialog"} action={form} busy={busy} message={message} close={closeDialog} submit={submit} references={references} selectedTransaction={selectedTransaction} selectedForecast={selectedForecast} setAction={action => { setSelectedForecast(null); setSelectedTransaction(null); setForm(action); }} pendingPreview={pendingPreview} pendingReverseReview={pendingReverseReview} clearPreview={() => { setPendingPreview(null); setPendingReverseReview(null); }} />}
  </AppShell>;
}

function EmptyInline({ text }: { text: string }) { return <Empty><EmptyDescription>{text}</EmptyDescription></Empty>; }

function ResourceSection({ title, detail, action, secondaryAction, setForm, rows, transactionActions }: { title: string; detail: string; action: Action; secondaryAction?: Action; setForm: (action: Action) => void; rows: (AccountOption | CategoryOption | TransactionOption | StatementOption)[]; transactionActions?: { correct: (transaction: TransactionOption) => void; reverse: (transaction: TransactionOption) => void } }) {
  return <Card><CardHeader><div className="flex flex-wrap items-start justify-between gap-4"><div className="flex flex-col gap-1"><CardTitle><h2>{title}</h2></CardTitle><CardDescription>{detail}</CardDescription></div><div className="flex flex-wrap gap-2">{secondaryAction && <Button variant="outline" onClick={() => setForm(secondaryAction)}>{actionLabels[secondaryAction]}</Button>}<Button onClick={() => setForm(action)}>{action === "close" ? "Fechar fatura" : actionLabels[action]}</Button></div></div></CardHeader><CardContent><Rows rows={rows} empty="Ainda não há registros. Adicione o primeiro para começar." transactionActions={transactionActions} /></CardContent></Card>;
}

function Rows({ rows, empty, transactionActions }: { rows: (AccountOption | CategoryOption | TransactionOption | StatementOption)[]; empty: string; transactionActions?: { correct: (transaction: TransactionOption) => void; reverse: (transaction: TransactionOption) => void } }) {
  if (!rows.length) return <EmptyInline text={empty} />;
  return <ul className="divide-y divide-border">{rows.map(row => {
    let title: string, detail: string, amount = "";
    if ("balanceMinor" in row) { title = row.name; detail = `${row.type === "credit_card" ? "Cartão" : "Conta"} · ${row.currency}${row.type === "credit_card" && row.availableCreditMinor !== undefined ? ` · disponível ${row.availableCreditMinor === null ? "sem limite definido" : formatMinor(row.availableCreditMinor, row.currency)}` : ""}`; amount = formatMinor(row.balanceMinor, row.currency); }
    else if ("dueOn" in row) { title = row.cardAccountName; detail = `Vence em ${formatDate(row.dueOn)} · ${statementStatusLabel(row.status)}`; amount = row.creditBalanceMinor && BigInt(row.creditBalanceMinor) > 0n ? `Crédito ${formatMinor(row.creditBalanceMinor, row.currency)}` : row.remainingMinor ? formatMinor(row.remainingMinor, row.currency) : ""; }
    else if ("occurredOn" in row) { title = row.description; detail = [formatDate(row.occurredOn), transactionKindLabel(row.kind), row.counterpartyName].filter(Boolean).join(" · "); amount = row.entries?.map(entry => entry.currency ? formatMinor(entry.amountMinor, entry.currency) : entry.amountMinor).join(" / ") ?? ""; }
    else { title = row.name; detail = row.type === "income" ? "Categoria de receita" : "Categoria de despesa"; }
    return <li id={"occurredOn" in row ? `transaction-${row.id}` : undefined} key={row.id} className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1 basis-36"><p className="break-words text-sm font-medium">{title}</p><p className="mt-1 break-words text-xs leading-5 text-muted-foreground">{detail}</p>{"occurredOn" in row && <>{row.reviewStatus && row.reviewStatus !== "confirmed" && <Badge variant="outline" className="mt-2">Precisa revisar</Badge>}{row.notes && <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs text-muted-foreground">{row.notes}</p>}</>}</div>{amount && <span className="max-w-full break-words font-mono text-sm font-medium tabular-nums">{amount}</span>}</div>
      {transactionActions && "occurredOn" in row && <details className="mt-3 rounded-lg bg-muted px-3 py-2 text-sm"><summary className="flex min-h-11 cursor-pointer items-center text-xs font-medium text-primary">Detalhes, revisões e vínculos</summary><div className="mt-3 grid gap-3 text-xs text-muted-foreground">
        <p>O histórico preserva as revisões deste lançamento.</p>
        <div><p className="font-medium text-foreground">Contas movimentadas</p>{row.entries?.map((entry, index) => <p key={`${entry.accountId}-${index}`} className="mt-1 flex flex-wrap justify-between gap-2 [&>span]:min-w-0 [&>span]:max-w-full [&>span]:break-words"><span>{entry.accountName}</span><span className="tabular-nums">{formatMinor(entry.amountMinor, entry.currency)}</span></p>)}</div>
        {row.allocations?.length ? <div><p className="font-medium text-foreground">Categorias atuais</p>{row.allocations.map((allocation, index) => <p key={`${allocation.categoryId}-${index}`} className="mt-1 flex flex-wrap justify-between gap-2 [&>span]:min-w-0 [&>span]:max-w-full [&>span]:break-words"><span>{allocation.categoryName ?? "Sem categoria"}</span><span className="tabular-nums">{formatMinor(allocation.amountMinor, row.entries?.[0]?.currency ?? "BRL")}</span></p>)}</div> : null}
        {(row.reversalOfTransactionId || row.reversedByTransactionIds?.length) && <div><p className="font-medium text-foreground">Vínculos</p>{row.reversalOfTransactionId && <a className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline" href={`#transaction-${row.reversalOfTransactionId}`}>Reverte o lançamento {row.reversalOfTransactionId.slice(0, 8)}</a>}{row.reversedByTransactionIds?.map(id => <a key={id} className="mt-1 block inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline" href={`#transaction-${id}`}>Revertido pelo lançamento {id.slice(0, 8)}</a>)}</div>}
        {!!row.revisions?.length && <div><p className="font-medium text-foreground">Revisões registradas</p><ol className="mt-1 grid gap-2">{row.revisions.map(revision => <li key={revision.id} className="border-l-2 border-primary/30 pl-2"><strong>Revisão {revision.revisionNumber}</strong> · {revision.reason}<br />Por {revision.actor} ({revision.source}) em {new Date(revision.createdAt).toLocaleString("pt-BR")}</li>)}</ol><p className="mt-2 text-muted-foreground">Consulte o motivo e a autoria de cada revisão acima.</p></div>}
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => transactionActions.correct(row)}>Corrigir dados ou categoria</Button>{row.canReverse && <Button variant="outline" onClick={() => transactionActions.reverse(row)}>Cancelar lançamento</Button>}</div>
      </div></details>}
    </li>;
  })}</ul>;
}

function ExpenseForecasts({ forecasts, references, setForm, onRealize, onCancel }: { forecasts: ExpenseForecastOption[]; references: References; setForm: (action: Action) => void; onRealize: (forecast: ExpenseForecastOption) => void; onCancel: (forecast: ExpenseForecastOption) => void }) {
  const groups: [ExpenseForecastOption["status"], string][] = [["projected", "Projetadas"], ["realized", "Realizadas"], ["cancelled", "Canceladas"]];
  return <Card className="mt-6"><CardHeader><div className="flex flex-wrap items-start justify-between gap-4"><div className="flex flex-col gap-1"><CardTitle><h2>Previsões avulsas</h2></CardTitle><CardDescription>Compromissos esperados. Só alteram o saldo e as despesas quando realizados.</CardDescription></div><Button onClick={() => setForm("forecast")}>Nova previsão</Button></div></CardHeader>
    <CardContent className="grid gap-5">{groups.map(([status, title]) => {
      const items = forecasts.filter(forecast => forecast.status === status).sort((a, b) => a.expectedOn.localeCompare(b.expectedOn));
      return <section key={status} aria-labelledby={`forecast-${status}`}><div className="flex items-baseline justify-between gap-2"><h3 id={`forecast-${status}`} className="font-medium">{title}</h3><span className="text-xs text-muted-foreground">{items.length}</span></div>{items.length ? <ul className="mt-2 divide-y divide-border">{items.map(forecast => {
        const account = references.accounts.find(item => item.id === forecast.accountId);
        const category = references.categories.find(item => item.id === forecast.categoryId);
        return <li key={forecast.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{forecast.description}</p><p className="mt-1 text-xs text-muted-foreground">{formatDate(forecast.expectedOn)} · {account?.name ?? "Conta"} · {category?.name ?? "Sem categoria"}</p>{forecast.realizedTransactionId && <a className="mt-1 inline-block inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline text-xs" href={`/entries#transaction-${forecast.realizedTransactionId}`}>Ver despesa realizada</a>}</div><div className="flex max-w-full flex-wrap items-center gap-3"><strong className="break-words font-mono text-sm tabular-nums">{formatMinor(forecast.amountMinor, forecast.currency)}</strong>{status === "projected" && <div className="flex gap-1"><Button variant="outline" onClick={() => onRealize(forecast)}>Realizar</Button><Button variant="outline" onClick={() => onCancel(forecast)}>Cancelar</Button></div>}</div></li>;
      })}</ul> : <p className="mt-2 text-sm text-muted-foreground">Nenhuma previsão {status === "projected" ? "projetada" : status === "realized" ? "realizada" : "cancelada"} neste período.</p>}</section>;
    })}</CardContent>
  </Card>;
}
