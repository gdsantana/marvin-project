"use client";

import { type FormEvent, createContext, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel, FieldSet, FieldLegend } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { formatDate, formatMinor, majorInputFromMinor } from "./finance-format";
import { actionLabels, primaryActions, type Action, type AccountOption, type CategoryOption, type TransactionOption, type ExpenseForecastOption, type References } from "./workspace-types";

const PendingContext = createContext(false);

function todayLocal() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function FormField({ label, name, type = "text", required = true, options, placeholder, min, step, value, defaultValue, onChange }: { label: string; name: string; type?: string; required?: boolean; options?: [string, string][]; placeholder?: string; min?: string; step?: string; value?: string; defaultValue?: string; onChange?: React.ChangeEventHandler<HTMLInputElement | HTMLSelectElement> }) {
  const disabled = useContext(PendingContext);
  const amount = name === "amountMinor" || name === "totalAmountMinor";
  const controlled = value === undefined ? {} : { value };
  const initial = value === undefined && defaultValue !== undefined ? { defaultValue } : {};
  const id = useId();
  const [error, setError] = useState("");
  const validate = (control: HTMLInputElement | HTMLSelectElement) => {
    setError(control.validity.valid ? "" : control.validity.valueMissing ? "Preencha este campo." : "Confira o valor informado.");
  };
  const props = {
    id, name, required, disabled, "aria-invalid": Boolean(error), "aria-describedby": error ? `${id}-error` : undefined,
    onInvalid: (event: React.InvalidEvent<HTMLInputElement | HTMLSelectElement>) => validate(event.currentTarget),
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      if (error) validate(event.currentTarget);
      onChange?.(event);
    },
    ...controlled, ...initial,
  };
  return <Field data-invalid={Boolean(error)} data-disabled={disabled} className={amount ? "sm:col-span-2" : undefined}>
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    {options ? <NativeSelect className="w-full" {...props}>{options.map(([optionValue, text]) => <option key={optionValue} value={optionValue}>{text}</option>)}</NativeSelect> : <Input {...props} variant={amount ? "amount" : "default"} type={type} inputMode={name.endsWith("Minor") || name === "amountMinor" || name === "totalAmountMinor" ? "decimal" : undefined} placeholder={placeholder} min={min} step={step} />}
    {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
  </Field>;
}

function NotesField({ defaultValue }: { defaultValue?: string }) {
  const id = useId();
  return <Field><FieldLabel htmlFor={id}>Notas</FieldLabel><textarea id={id} className="min-h-20 w-full rounded-lg border border-input bg-background px-3 py-2 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50" name="notes" placeholder="Detalhes para você lembrar" defaultValue={defaultValue} /></Field>;
}

function CategorySplits({ categories, initial = [] }: { categories: CategoryOption[]; initial?: { categoryId: string | null; amountMinor: string }[] }) {
  const [rows, setRows] = useState(() => initial.length ? initial.map((_item, index) => index) : [0]);
  const [nextId, setNextId] = useState(initial.length || 1);
  const options: [string, string][] = [["", "Sem categoria"], ...categories.map(category => [category.id, category.name] as [string, string])];
  return <FieldSet className="rounded-xl border p-3 sm:col-span-2"><FieldLegend>Categorias desta operação</FieldLegend><FieldGroup><p className="text-xs leading-5 text-muted-foreground">A soma das categorias deve ser igual ao valor total.</p>{rows.map((id, index) => <FieldGroup key={id} className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"><div className="min-w-0"><FormField label={`Categoria ${index + 1}`} name="allocationCategoryId" required={false} options={options} defaultValue={initial[index]?.categoryId ?? ""} /></div><FormField label="Valor (R$)" name="allocationAmount" placeholder="Ex.: 85,00" defaultValue={majorInputFromMinor(initial[index]?.amountMinor ?? null)} /><Button type="button" aria-label={`Remover categoria ${index + 1}`} disabled={rows.length === 1} onClick={() => setRows(current => current.filter(item => item !== id))} variant="outline" className="mb-px">−</Button></FieldGroup>)}<Button type="button" onClick={() => { setRows(current => [...current, nextId]); setNextId(value => value + 1); }} variant="outline" className="w-fit">＋ Outra categoria</Button></FieldGroup></FieldSet>;
}

function CardSettingsFields({ accounts, onReady }: { accounts: AccountOption[]; onReady: (ready: boolean) => void }) {
  const cards = accounts.filter(account => account.type === "credit_card");
  const firstCardId = cards[0]?.id ?? "";
  const [accountId, setAccountId] = useState(firstCardId);
  useEffect(() => { if (!accountId && firstCardId) setAccountId(firstCardId); }, [accountId, firstCardId]);
  const [settings, setSettings] = useState({ creditLimitMinor: "", closingDay: "", dueDay: "", billingTimezone: "America/Sao_Paulo", billingMode: "manual" });
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    onReady(false);
    if (!accountId) return;
    const controller = new AbortController();
    setLoadError("");
    setSettings({ creditLimitMinor: "", closingDay: "", dueDay: "", billingTimezone: "America/Sao_Paulo", billingMode: "manual" });
    fetch(`/api/v1/cards/settings?accountId=${accountId}`, { cache: "no-store", signal: controller.signal }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error("Não foi possível carregar a configuração. Selecione o cartão novamente para tentar.");
      if (controller.signal.aborted) return;
      setSettings({ creditLimitMinor: majorInputFromMinor(result.data.creditLimitMinor), closingDay: String(result.data.closingDay), dueDay: String(result.data.dueDay), billingTimezone: result.data.billingTimezone, billingMode: result.data.billingMode });
      setLoadError(""); onReady(true);
    }).catch(() => { if (!controller.signal.aborted) setLoadError("Não foi possível carregar a configuração. Selecione o cartão novamente para tentar."); });
    return () => controller.abort();
  }, [accountId, onReady]);
  const update = (key: keyof typeof settings) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setSettings(current => ({ ...current, [key]: event.target.value }));
  return <>
    <FormField label="Cartão" name="accountId" options={cards.map(card => [card.id, `${card.name} · ${card.currency}`] as [string, string])} value={accountId} onChange={event => setAccountId(event.target.value)} />
    <FormField label="Limite (moeda do cartão)" name="creditLimitMinor" required={false} placeholder="Deixe em branco para sem limite" value={settings.creditLimitMinor} onChange={update("creditLimitMinor")} />
    <FormField label="Dia de fechamento" name="closingDay" type="number" min="1" value={settings.closingDay} onChange={update("closingDay")} />
    <FormField label="Dia de vencimento" name="dueDay" type="number" min="1" value={settings.dueDay} onChange={update("dueDay")} />
    <FormField label="Fuso horário" name="billingTimezone" value={settings.billingTimezone} onChange={update("billingTimezone")} />
    <FormField label="Fechamento" name="billingMode" options={[["manual", "Manual"], ["automatic", "Automático"]]} value={settings.billingMode} onChange={update("billingMode")} />
    {loadError && <Alert variant="destructive" className="sm:col-span-2"><AlertDescription>{loadError}</AlertDescription></Alert>}
  </>;
}

function AccountFields({ references }: { references: References }) {
  const [type, setType] = useState("checking");
  return <>
    <FormField label="Nome da conta ou cartão" name="name" placeholder="Ex.: Conta principal" />
    <FormField label="Tipo" name="type" options={[["checking", "Conta corrente"], ["savings", "Poupança"], ["cash", "Dinheiro"], ["credit_card", "Cartão de crédito"]]} value={type} onChange={event => setType(event.target.value)} />
    <FormField label="Moeda" name="currency" options={[["BRL", "Real brasileiro (BRL)"], ["PLN", "Złoty polonês (PLN)"], ["EUR", "Euro (EUR)"]]} />
    <FormField label="Saldo inicial (moeda da conta)" name="openingBalanceMinor" placeholder="2500,00" />
    <FormField label="Data do saldo inicial" name="openingDate" type="date" defaultValue={todayLocal()} />
    <FormField label="Instituição" name="institutionId" required={false} options={[["", "Sem instituição"], ...references.institutions.map(institution => [institution.id, institution.name] as [string, string])]} />
    {type === "credit_card" && <><FormField label="Limite do cartão (moeda do cartão)" name="creditLimitMinor" required={false} placeholder="Deixe em branco para sem limite" /><FormField label="Dia de fechamento" name="closingDay" type="number" min="1" /><FormField label="Dia de vencimento" name="dueDay" type="number" min="1" /></>}
  </>;
}

function PreviewSummary({ result, references }: { result: Record<string, unknown>; references: References }) {
  const entries = (result.entries ?? []) as { accountId: string; amountMinor: string }[];
  const allocations = (result.allocations ?? []) as { categoryId: string | null; amountMinor: string }[];
  const installments = (result.installments ?? []) as { number: number; amountMinor: string; closingOn: string; dueOn: string }[];
  const currency = references.accounts.find(account => account.id === entries[0]?.accountId)?.currency ?? "BRL";
  const plannedStatement = result.plannedStatement as { cycleStartOn: string; closingOn: string; dueOn: string } | undefined;
  return <section className="sm:col-span-2 rounded-xl border border-border bg-muted p-4"><h3 className="font-semibold">Revise antes de gravar</h3><p className="mt-1 text-xs text-muted-foreground">Confira os dados antes de confirmar. Nenhum dado foi salvo ainda.</p>{entries.map((entry, index) => { const account = references.accounts.find(item => item.id === entry.accountId); return <p key={`${entry.accountId}-${index}`} className="mt-3 flex flex-wrap justify-between gap-3 text-sm [&>span]:min-w-0 [&>span]:break-words [&>strong]:max-w-full [&>strong]:break-words"><span>{account?.name ?? "Conta"}</span><strong className="tabular-nums">{formatMinor(entry.amountMinor, account?.currency ?? currency)}</strong></p>; })}{allocations.length > 0 && <div className="mt-3"><p className="text-xs font-medium text-muted-foreground">Alocação por categoria</p>{allocations.map((allocation, index) => { const category = references.categories.find(item => item.id === allocation.categoryId); return <p key={`${allocation.categoryId}-${index}`} className="mt-1 flex flex-wrap justify-between gap-3 text-sm [&>span]:min-w-0 [&>span]:break-words [&>strong]:max-w-full [&>strong]:break-words"><span>{category?.name ?? "Sem categoria"}</span><strong className="tabular-nums">{formatMinor(allocation.amountMinor, currency)}</strong></p>; })}</div>}{installments.length > 0 && <div className="mt-4"><p className="text-xs font-medium text-muted-foreground">Parcelas previstas</p><ul className="mt-2 grid gap-1">{installments.map(item => <li key={item.number} className="flex flex-wrap justify-between gap-3 text-sm [&>span]:min-w-0 [&>span]:break-words [&>strong]:max-w-full [&>strong]:break-words"><span>{item.number}/{installments.length} · vence {formatDate(item.dueOn)}</span><strong className="tabular-nums">{formatMinor(item.amountMinor, currency)}</strong></li>)}</ul></div>}{plannedStatement && <p className="mt-3 text-sm">A previsão abre um ciclo novo: {formatDate(plannedStatement.cycleStartOn)} a {formatDate(plannedStatement.closingOn)}, vencimento {formatDate(plannedStatement.dueOn)}.</p>}{typeof result.remainingStatementMinor === "string" && <p className="mt-3 text-sm">Saldo restante da fatura: <strong>{formatMinor(result.remainingStatementMinor, currency)}</strong></p>}</section>;
}

function ReversalReview({ transaction, references, reason, replacement }: { transaction: TransactionOption; references: References; reason: string; replacement: Record<string, unknown> | null }) {
  const accounts = references.accounts;
  return <section className="sm:col-span-2 rounded-xl border border-border bg-muted p-4"><h3 className="font-semibold">Revise a reversão antes de confirmar</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">A reversão cria uma compensação vinculada ao lançamento original e preserva seu histórico. Confira os valores, as contas e o motivo antes de confirmar.</p><h4 className="mt-4 text-xs font-semibold">Movimentação original</h4>{transaction.entries?.map((entry, index) => <p key={`${entry.accountId}-${index}`} className="mt-1 flex flex-wrap justify-between gap-3 text-sm [&>span]:min-w-0 [&>span]:break-words [&>strong]:max-w-full [&>strong]:break-words"><span>{entry.accountName}</span><strong className="tabular-nums">{formatMinor(entry.amountMinor, entry.currency)}</strong></p>)}<p className="mt-3 text-sm"><span className="font-medium">Motivo:</span> {reason}</p>{replacement && <><h4 className="mt-4 text-xs font-semibold">Lançamento substituto</h4><p className="text-sm">{String(replacement.description)} · {formatDate(String(replacement.occurredOn))}</p>{("accountId" in replacement) && <p className="mt-1 flex flex-wrap justify-between gap-3 text-sm [&>span]:min-w-0 [&>span]:break-words [&>strong]:max-w-full [&>strong]:break-words"><span>{accounts.find(account => account.id === replacement.accountId)?.name ?? "Conta"}</span><strong className="tabular-nums">{formatMinor(String(replacement.amountMinor), accounts.find(account => account.id === replacement.accountId)?.currency ?? "BRL")}</strong></p>}{("fromAccountId" in replacement) && <><p className="mt-1 flex flex-wrap justify-between gap-3 text-sm [&>span]:min-w-0 [&>span]:break-words [&>strong]:max-w-full [&>strong]:break-words"><span>{accounts.find(account => account.id === replacement.fromAccountId)?.name ?? "Origem"} → {accounts.find(account => account.id === replacement.toAccountId)?.name ?? "Destino"}</span><strong className="tabular-nums">{formatMinor(String(replacement.amountMinor), accounts.find(account => account.id === replacement.fromAccountId)?.currency ?? "BRL")}</strong></p></>}</>}</section>;
}

function CorrectionFields({ transaction, references }: { transaction: TransactionOption; references: References }) {
  const [replaceCategories, setReplaceCategories] = useState(false);
  const initial = (transaction.allocations ?? []).map(allocation => ({ categoryId: allocation.categoryId, amountMinor: BigInt(allocation.amountMinor) < 0n ? (-BigInt(allocation.amountMinor)).toString() : allocation.amountMinor }));
  const hasRefund = references.transactions.some(item => item.kind === "refund" && item.relatedTransactionId === transaction.id);
  return <><Alert role="note" className="sm:col-span-2"><AlertDescription>A correção registra uma revisão com motivo. Valores e datas financeiras só podem mudar por reversão compensatória.</AlertDescription></Alert><FormField label="Motivo da correção" name="reason" placeholder="Explique o que precisa ser corrigido" /><FormField label="Descrição" name="description" defaultValue={transaction.description} /><FormField label="Estabelecimento ou pessoa" name="counterpartyName" required={false} defaultValue={transaction.counterpartyName ?? ""} /><NotesField defaultValue={transaction.notes ?? ""} /><FormField label="Status" name="reviewStatus" defaultValue={transaction.reviewStatus ?? "confirmed"} options={[["confirmed", "Confirmado"], ["needs_review", "Precisa revisar"]]} />{["income", "expense"].includes(transaction.kind) && !hasRefund && <Field orientation="horizontal" className="sm:col-span-2"><Input id="replace-categories" className="size-5 min-h-5 w-5" type="checkbox" name="replaceCategories" checked={replaceCategories} onChange={event => setReplaceCategories(event.target.checked)} /><FieldLabel htmlFor="replace-categories">Revisar categorias</FieldLabel></Field>}{replaceCategories && <CategorySplits categories={references.categories.filter(category => category.type === (transaction.kind === "income" ? "income" : "expense"))} initial={initial} />}</>;
}

function ReversalFields({ references }: { references: References }) {
  const [replacementKind, setReplacementKind] = useState("");
  const accountOptions = (filter?: (account: AccountOption) => boolean): [string, string][] => references.accounts.filter(filter ?? (() => true)).map(account => [account.id, `${account.name} · ${account.currency}`]);
  const categories = references.categories.filter(category => !category.isArchived && category.type === (replacementKind === "income" ? "income" : "expense"));
  return <><Alert role="note" className="sm:col-span-2"><AlertDescription>A reversão é definitiva e cria uma compensação, preservando o lançamento original. Não é possível reverter operações ligadas a cartões, faturas, reembolsos ou lançamentos já revertidos.</AlertDescription></Alert><FormField label="Data da compensação" name="occurredOn" type="date" defaultValue={todayLocal()} /><FormField label="Motivo" name="reason" placeholder="Ex.: lançamento duplicado" /><FormField label="Substituir por um novo lançamento?" name="replacementKind" required={false} value={replacementKind} onChange={event => setReplacementKind(event.target.value)} options={[["", "Não criar substituição"], ["income", "Nova receita"], ["expense", "Nova despesa"], ["transfer", "Nova transferência"]]} />{replacementKind && <><FormField label="Descrição do novo lançamento" name="replacementDescription" placeholder="Descreva o registro correto" /><FormField label="Data do novo lançamento" name="replacementOn" type="date" defaultValue={todayLocal()} /><FormField label="Valor (R$)" name="amountMinor" placeholder="85,00" />{replacementKind === "transfer" ? <><FormField label="Conta de origem" name="replacementFromAccountId" options={accountOptions(account => account.type !== "credit_card")} /><FormField label="Conta de destino" name="replacementToAccountId" options={accountOptions(account => account.type !== "credit_card")} /></> : <><FormField label="Conta" name="replacementAccountId" options={accountOptions(account => account.type !== "credit_card")} />{replacementKind === "income" ? <FormField label="Categoria" name="replacementCategoryId" required={false} options={[["", "Sem categoria"], ...categories.map(category => [category.id, category.name] as [string, string])]} /> : <><FormField label="Forma de pagamento" name="replacementPaymentMethod" options={[["pix", "Pix"], ["debit", "Débito"], ["cash", "Dinheiro"], ["other", "Outra"]]} /><CategorySplits categories={categories} /></>}</>}{<FormField label="Status do novo lançamento" name="replacementReviewStatus" options={[["confirmed", "Confirmado"], ["needs_review", "Precisa revisar"]]} />}</>}</>;
}

export function ActionDialog({ action, busy, message, close, submit, references, selectedTransaction, selectedForecast, setAction, pendingPreview, pendingReverseReview, clearPreview }: { action: Action; busy: boolean; message: string; close: () => void; submit: (event: FormEvent<HTMLFormElement>) => void; references: References; selectedTransaction: TransactionOption | null; selectedForecast: ExpenseForecastOption | null; setAction: (action: Action) => void; pendingPreview: { signature: string; data: Record<string, unknown> } | null; pendingReverseReview: { signature: string; reason: string; replacement: Record<string, unknown> | null } | null; clearPreview: () => void }) {
  const [returnFocus] = useState(() => typeof document === "undefined" ? null : document.activeElement as HTMLElement | null);
  const formRef = useRef<HTMLFormElement>(null);
  const [cardSettingsReady, setCardSettingsReady] = useState(false);

  const fields = useMemo(() => {
    const accountOptions = (filter?: (account: AccountOption) => boolean): [string, string][] => references.accounts.filter(filter ?? (() => true)).map(account => [account.id, `${account.name} · ${account.currency}`]);
    const categoryOptions = (type?: "income" | "expense"): [string, string][] => references.categories.filter(category => !category.isArchived && (!type || category.type === type)).map(category => [category.id, category.name] as [string, string]);
    const statementOptions: [string, string][] = references.statements.map(statement => [statement.id, `${statement.cardAccountName} · vence ${formatDate(statement.dueOn)} · ${statement.status}`]);
    const purchaseOptions: [string, string][] = references.transactions.filter(transaction => transaction.kind === "expense").map(transaction => [transaction.id, `${transaction.description} · ${formatDate(transaction.occurredOn)}`]);
    const accountField = (label: string, name: string, filter?: (account: AccountOption) => boolean, required = true) => <FormField label={label} name={name} required={required} options={accountOptions(filter)} />;
    const shared = <><FormField label="Descrição" name="description" placeholder="Ex.: Mercado do mês" /><FormField label="Data da operação" name="occurredOn" type="date" defaultValue={todayLocal()} /><FormField label="Data de postagem" name="postedOn" type="date" required={false} /><FormField label="Estabelecimento ou pessoa" name="counterpartyName" required={false} placeholder="Opcional" /><NotesField /><FormField label="Status" name="reviewStatus" options={[["confirmed", "Confirmado"], ["needs_review", "Precisa revisar"]]} /></>;
    switch (action) {
      case "institution": return <FormField label="Nome da instituição" name="name" placeholder="Ex.: Banco do Brasil" />;
      case "account": return <AccountFields references={references} />;
      case "configureCard": return <CardSettingsFields accounts={references.accounts} onReady={setCardSettingsReady} />;
      case "category": return <><FormField label="Nome da categoria" name="name" placeholder="Ex.: Moradia" /><FormField label="Tipo" name="type" options={[["expense", "Despesa"], ["income", "Receita"]]} /><FormField label="Categoria superior" name="parentId" required={false} options={[["", "Sem categoria superior"], ...categoryOptions()]} /></>;
      case "income": return <><FormField label="Valor (R$)" name="amountMinor" placeholder="2500,00" /><FormField label="Conta" name="accountId" options={accountOptions(account => account.type !== "credit_card")} /><FormField label="Categoria" name="categoryId" required={false} options={[["", "Sem categoria"] , ...categoryOptions("income")]} />{shared}</>;
      case "expense": return <><FormField label="Valor (R$)" name="amountMinor" placeholder="85,00" />{accountField("Conta", "accountId", account => account.type !== "credit_card")}<FormField label="Forma de pagamento" name="paymentMethod" options={[["pix", "Pix"], ["debit", "Débito"], ["cash", "Dinheiro"], ["other", "Outra"]]} /><CategorySplits categories={references.categories.filter(category => category.type === "expense" && !category.isArchived)} />{shared}</>;
      case "transfer": return <><FormField label="Valor (R$)" name="amountMinor" placeholder="500,00" />{accountField("Conta de origem", "fromAccountId", account => account.type !== "credit_card")}{accountField("Conta de destino", "toAccountId", account => account.type !== "credit_card")}{shared}</>;
      case "purchase": return <><FormField label="Valor total (R$)" name="totalAmountMinor" placeholder="1000,00" />{accountField("Cartão", "cardAccountId", account => account.type === "credit_card")}<FormField label="Número de parcelas" name="installmentCount" type="number" min="1" /><CategorySplits categories={references.categories.filter(category => category.type === "expense" && !category.isArchived)} />{shared}</>;
      case "cashback": return <><FormField label="Valor (R$)" name="amountMinor" placeholder="25,00" />{accountField("Conta ou cartão", "accountId")}<FormField label="Categoria" name="categoryId" required={false} options={[["", "Sem categoria"], ...categoryOptions("income")]} /><FormField label="Fatura (crédito no cartão)" name="cardStatementId" required={false} options={[["", "Nenhuma fatura"], ...statementOptions]} />{shared}</>;
      case "refund": return <><FormField label="Valor (R$)" name="amountMinor" placeholder="12,00" /><FormField label="Compra original" name="originalTransactionId" options={[["", "Selecione uma compra"], ...purchaseOptions]} />{accountField("Conta ou cartão", "accountId")}{shared}</>;
      case "payment": return <><FormField label="Valor do pagamento (R$)" name="amountMinor" placeholder="330,00" /><FormField label="Fatura" name="statementId" options={[["", "Selecione uma fatura"], ...references.statements.filter(statement => statement.status !== "open").map(statement => [statement.id, `${statement.cardAccountName} · vence ${formatDate(statement.dueOn)}`] as [string, string])]} />{accountField("Conta de origem", "fromAccountId", account => account.type !== "credit_card")}{shared}</>;
      case "close": return <><FormField label="Fatura" name="statementId" options={[["", "Selecione uma fatura"], ...references.statements.filter(statement => statement.status === "open").map(statement => [statement.id, `${statement.cardAccountName} · vence ${formatDate(statement.dueOn)}`] as [string, string])]} />{shared}</>;
      case "forecast": return <><Alert role="note" className="sm:col-span-2"><AlertDescription>Uma previsão não cria lançamento nem altera saldo ou relatório. Ao realizar, o sistema registra uma despesa usando o mesmo valor e categoria.</AlertDescription></Alert><FormField label="Descrição" name="description" placeholder="Ex.: Seguro do carro" /><FormField label="Data esperada" name="expectedOn" type="date" defaultValue={todayLocal()} /><FormField label="Valor (R$)" name="amountMinor" placeholder="250,00" />{accountField("Conta de pagamento", "accountId", account => account.type !== "credit_card")}<FormField label="Categoria" name="categoryId" required={false} options={[["", "Sem categoria"], ...categoryOptions("expense")]} /></>;
      case "realizeForecast": return <><Alert role="note" className="sm:col-span-2"><AlertDescription>{selectedForecast?.description} · {selectedForecast && formatMinor(selectedForecast.amountMinor, selectedForecast.currency)} · prevista para {selectedForecast ? formatDate(selectedForecast.expectedOn) : ""}. Realizar registra agora uma despesa e altera o saldo da conta.</AlertDescription></Alert><FormField label="Data da despesa" name="occurredOn" type="date" defaultValue={todayLocal()} /><FormField label="Data de postagem" name="postedOn" type="date" required={false} /><FormField label="Forma de pagamento" name="paymentMethod" options={[["pix", "Pix"], ["debit", "Débito"], ["cash", "Dinheiro"], ["other", "Outra"]]} /><FormField label="Status" name="reviewStatus" options={[["confirmed", "Confirmado"], ["needs_review", "Precisa revisar"]]} /></>;
      case "cancelForecast": return <Alert role="note" className="sm:col-span-2"><AlertDescription>Cancelar “{selectedForecast?.description}” ({selectedForecast && formatMinor(selectedForecast.amountMinor, selectedForecast.currency)}) em {selectedForecast ? formatDate(selectedForecast.expectedOn) : ""}? O histórico continuará registrado e nenhum saldo será alterado.</AlertDescription></Alert>;
      case "correct": return selectedTransaction ? <CorrectionFields key={selectedTransaction.id} transaction={selectedTransaction} references={references} /> : <p>Selecione um lançamento para corrigir.</p>;
      case "reverse": return selectedTransaction ? <><Alert role="note" className="sm:col-span-2"><AlertDescription>Original: <strong>{selectedTransaction.description}</strong> · {formatDate(selectedTransaction.occurredOn)}. A reversão e eventual substituição serão revistas antes do envio.</AlertDescription></Alert><ReversalFields key={selectedTransaction.id} references={references} /></> : <p>Selecione um lançamento para reverter.</p>;
    }
  }, [action, references, selectedTransaction, selectedForecast]);

  return <PendingContext value={busy}><Dialog open onOpenChange={open => { if (!open && !busy) close(); }}>
    <DialogContent showCloseButton={false} className="overscroll-contain sm:max-w-xl" finalFocus={returnFocus ? { current: returnFocus } : true} initialFocus={() => formRef.current?.querySelector<HTMLElement>("input,select,textarea,button") ?? true}>
      <DialogHeader>
        <DialogTitle>{actionLabels[action]}</DialogTitle>
        <DialogDescription>{action === "cancelForecast" ? "Confira a previsão antes de cancelar." : "Confira os dados da operação. Para valores em reais, use o formato 2500,00."}</DialogDescription>
        <Button type="button" variant="ghost" size="icon" disabled={busy} onClick={close} aria-label="Fechar" className="absolute top-2 right-2">×</Button>
      </DialogHeader>
      {!selectedTransaction && !selectedForecast && <FormField label="Tipo de registro" name="actionType" value={action} onChange={event => { clearPreview(); setAction(event.target.value as Action); }} options={primaryActions.map(key => [key, actionLabels[key]])} />}
      <span role="status" className="sr-only">{busy ? "Processando operação" : ""}</span>
      <form ref={formRef} className="flex flex-col gap-4" onChange={clearPreview} onSubmit={submit} aria-busy={busy}>
        <fieldset disabled={busy} className="min-w-0 border-0 p-0">
          <FieldGroup key={action} className="grid grid-cols-1 sm:grid-cols-2">{fields}</FieldGroup>
        </fieldset>
        {pendingPreview && <PreviewSummary result={pendingPreview.data} references={references} />}
        {pendingReverseReview && selectedTransaction && <ReversalReview transaction={selectedTransaction} references={references} reason={pendingReverseReview.reason} replacement={pendingReverseReview.replacement} />}
        {message && <Alert variant="destructive"><AlertDescription>{message}</AlertDescription></Alert>}
        <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
          <Button type="button" onClick={close} disabled={busy} variant="outline">Cancelar</Button>
          <Button type="submit" disabled={busy || (action === "configureCard" && !cardSettingsReady)}>{busy ? "Validando…" : pendingReverseReview ? "Confirmar reversão" : pendingPreview ? "Confirmar e salvar" : ["income", "expense", "transfer", "purchase", "cashback", "refund", "payment"].includes(action) ? "Revisar operação" : action === "cancelForecast" ? "Confirmar cancelamento" : action === "reverse" ? "Revisar reversão" : actionLabels[action]}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog></PendingContext>;
}
