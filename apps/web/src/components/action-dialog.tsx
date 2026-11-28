"use client";

import Link from "next/link";
import { ChevronDown, XIcon } from "lucide-react";
import { type FormEvent, createContext, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldSet, FieldLegend } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { formatCurrencyMinor, formatDate, formatMinor, majorInputFromMinor, todayCivil } from "./finance-format";
import { actionLabels, canPayStatement, openingDebtCards, openingDebtMoveTargets, primaryActions, settingsActions, type Action, type AccountOption, type CategoryOption, type StatementOption, type TransactionOption, type ExpenseForecastOption, type References } from "./workspace-types";

import { CategoryPicker } from "./category-picker";
import { categoryPath } from "./category-path";

const PendingContext = createContext(false);


function FormField({ label, name, type = "text", required = true, options, placeholder, min, step, value, defaultValue, onChange, className, inputClassName, labelClassName, prefix, help }: { label: string; name: string; type?: string; required?: boolean; options?: [string, string][]; placeholder?: string; min?: string; step?: string; value?: string; defaultValue?: string; onChange?: React.ChangeEventHandler<HTMLInputElement | HTMLSelectElement>; className?: string; inputClassName?: string; labelClassName?: string; prefix?: string; help?: string }) {
  const disabled = useContext(PendingContext);
  const amount = name === "amountMinor" || name === "totalAmountMinor";
  const controlled = value === undefined ? {} : { value };
  const initial = value === undefined && defaultValue !== undefined ? { defaultValue } : {};
  const id = useId();
  const [invalid, setInvalid] = useState<{ value: string; message: string } | null>(null);
  const error = invalid && (value === undefined || value === invalid.value) ? invalid.message : "";
  const validate = (control: HTMLInputElement | HTMLSelectElement) => {
    setInvalid(control.validity.valid ? null : {
      value: control.value,
      message: control.validity.valueMissing ? "Preencha este campo." : "Confira o valor informado.",
    });
  };
  const props = {
    id, name, required, disabled, "aria-invalid": Boolean(error), "aria-describedby": [help && `${id}-help`, error && `${id}-error`].filter(Boolean).join(" ") || undefined,
    onInvalid: (event: React.InvalidEvent<HTMLInputElement | HTMLSelectElement>) => validate(event.currentTarget),
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      if (error) validate(event.currentTarget);
      onChange?.(event);
    },
    ...controlled, ...initial,
  };
  return <Field data-invalid={Boolean(error)} data-disabled={disabled} className={[amount ? "sm:col-span-2" : "", className ?? ""].filter(Boolean).join(" ")}>
    <FieldLabel className={labelClassName} htmlFor={id}>{label}</FieldLabel>
    {options ? <NativeSelect className={`w-full ${inputClassName ?? ""}`} {...props}>{options.map(([optionValue, text]) => <option key={optionValue} value={optionValue}>{text}</option>)}</NativeSelect> : prefix ? <div className="relative w-full"><span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center font-mono text-sm text-muted-foreground">{prefix}</span><Input className={`pl-10 ${inputClassName ?? ""}`} {...props} variant={amount ? "amount" : "default"} type={type} inputMode={name.endsWith("Minor") || name === "amountMinor" || name === "totalAmountMinor" ? "decimal" : undefined} placeholder={placeholder} min={min} step={step} /></div> : <Input className={inputClassName} {...props} variant={amount ? "amount" : "default"} type={type} inputMode={name.endsWith("Minor") || name === "amountMinor" || name === "totalAmountMinor" ? "decimal" : undefined} placeholder={placeholder} min={min} step={step} />}
    {help && <FieldDescription id={`${id}-help`}>{help}</FieldDescription>}
    {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
  </Field>;
}

function OpeningBalanceFields({ accounts }: { accounts: AccountOption[] }) {
  const [accountId, setAccountId] = useState("");
  const account = accounts.find(item => item.id === accountId);
  return <>
    <FormField label="Conta ou cartão" name="accountId" value={accountId} onChange={event => setAccountId(event.target.value)} options={[["", "Selecione uma conta"], ...accounts.filter(item => item.openingBalanceMinor !== undefined).map(item => [item.id, item.name] as [string, string])]} />
    {account && <>
      <input type="hidden" name="expectedOpeningBalanceMinor" value={account.openingBalanceMinor} />
      <p className="text-sm sm:col-span-2">Saldo inicial atual: {formatMinor(account.openingBalanceMinor!, account.currency)}</p>
      <FormField key={account.id} label="Novo saldo inicial" name="openingBalanceMinor" defaultValue={majorInputFromMinor(account.openingBalanceMinor!)} />
      <FormField label="Motivo da correção" name="reason" />
    </>}
    <Alert role="note" className="sm:col-span-2"><AlertDescription>Use valor negativo para dívida de cartão. A correção altera os saldos desde a abertura, sem registrar receita ou despesa e sem criar itens de fatura. Confira o valor antes de salvar.</AlertDescription></Alert>
  </>;
}

function TransactionAmountField({ action }: { action: "income" | "expense" | "purchase" }) {
  return <div className="min-w-0">
    <FormField label={action === "purchase" ? "Valor total" : "Valor"} name={action === "purchase" ? "totalAmountMinor" : "amountMinor"} placeholder="0,00" prefix="R$" inputClassName={`min-h-11 py-1 font-mono text-2xl tabular-nums ${action !== "income" ? "text-destructive" : "text-primary"}`} />
  </div>;
}

function TransactionCategory({ action, categories }: { action: "income" | "expense"; categories: CategoryOption[] }) {
  const [split, setSplit] = useState(false);
  const disabled = useContext(PendingContext);
  const splitAction = action === "expense" && <Button type="button" variant="ghost" className="min-h-11" onClick={() => setSplit(!split)}>{split ? "Usar uma categoria" : "Dividir entre categorias"}</Button>;
  return <div className="grid gap-2 sm:col-span-2">
    <input type="hidden" name="allocationMode" value={action === "expense" && split ? "split" : "single"} />
    {action === "expense" && split ? <><CategorySplits categories={categories} type={action} /><div>{splitAction}</div></> : <CategoryPicker categories={categories} type={action} disabled={disabled} action={splitAction} />}
  </div>;
}

function SimpleTransactionFields({ action, references, setAction }: { action: "income" | "expense" | "purchase"; references: References; setAction: (action: Action) => void }) {
  const credit = action === "purchase";
  const kind = action === "income" ? "income" : "expense";
  const accounts = references.accounts.filter(account => credit ? account.type === "credit_card" : account.type !== "credit_card");
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [accountId, setAccountId] = useState("");
  const account = accounts.find(item => item.id === accountId);
  return <>
    <TransactionAmountField action={action} />
    <FormField label="Descrição" name="description" placeholder="Ex.: Mercado do mês" />
    {kind === "expense" && <FormField label="Forma de pagamento" name="paymentMethod" value={credit ? "credit" : paymentMethod} onChange={event => {
      const method = event.target.value;
      if ((method === "credit") !== credit) {
        setAccountId("");
        setAction(method === "credit" ? "purchase" : "expense");
      }
      if (method !== "credit") setPaymentMethod(method);
    }} options={[["pix", "Pix"], ["debit", "Débito"], ["credit", "Cartão de crédito"], ["cash", "Dinheiro"], ["other", "Outra"]]} />}
    <div className="grid min-w-0 content-start gap-1">
      <FormField label={credit ? "Cartão" : "Conta"} name={credit ? "cardAccountId" : "accountId"} value={accountId} onChange={event => setAccountId(event.target.value)} options={[["", credit ? "Selecione um cartão" : "Selecione uma conta"], ...accounts.map(account => [account.id, account.name] as [string, string])]} />
      {account && <p className="break-words text-xs text-muted-foreground">Saldo atual: {formatMinor(account.balanceMinor, account.currency)}</p>}
    </div>
    <FormField label="Data" name="occurredOn" type="date" defaultValue={todayCivil()} className="min-w-0" />
    {credit && <FormField label="Parcelas" name="installmentCount" type="number" min="1" defaultValue="1" />}
    <TransactionCategory key={kind} action={kind} categories={references.categories.filter(category => !category.isArchived && category.type === kind)} />
    <details key="details" className="group sm:col-span-2">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm text-muted-foreground [&::-webkit-details-marker]:hidden"><ChevronDown aria-hidden="true" className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" />Mais detalhes</summary>
      <div className="grid gap-4 pt-3 sm:grid-cols-2">
        <FormField label="Data de postagem" name="postedOn" type="date" required={false} />
        <FormField label="Estabelecimento ou pessoa" name="counterpartyName" required={false} />
        <NotesField />
        <FormField label="Status" name="reviewStatus" options={[["confirmed", "Confirmado"], ["needs_review", "Precisa revisar"]]} />
      </div>
    </details>
  </>;
}

const transactionActions: Action[] = ["income", "expense", "transfer", "purchase", "cashback", "refund", "payment", "forecast"];

function TransactionKindPicker({ action, setAction, clearPreview, busy }: { action: "income" | "expense" | "purchase"; setAction: (action: Action) => void; clearPreview: () => void; busy: boolean }) {
  const choose = (next: "income" | "expense") => {
    if (action === next || (action === "purchase" && next === "expense")) return;
    clearPreview();
    setAction(next);
  };
  return <div role="group" aria-label="Tipo de registro" className="grid grid-cols-2 gap-1 rounded-xl bg-background p-1 min-[375px]:grid-cols-[1fr_1fr_minmax(7rem,1.15fr)]">
    {(["expense", "income"] as const).map(kind => <Button key={kind} type="button" disabled={busy} aria-pressed={action === kind || (action === "purchase" && kind === "expense")} onClick={() => choose(kind)} variant={action === kind || (action === "purchase" && kind === "expense") ? "secondary" : "ghost"} className={`min-h-11 ${(action === kind || action === "purchase") && kind === "expense" ? "text-destructive" : ""}`}>{kind === "expense" ? "Despesa" : "Receita"}</Button>)}
    <NativeSelect aria-label="Outros tipos de registro" disabled={busy} value="" onChange={event => { if (event.target.value) { clearPreview(); setAction(event.target.value as Action); } }} className="col-span-2 min-h-11 w-full bg-background min-[375px]:col-span-1">
      <option value="">Outros</option>
      {transactionActions.filter(kind => kind !== "income" && kind !== "expense").map(kind => <option key={kind} value={kind}>{actionLabels[kind]}</option>)}
    </NativeSelect>
  </div>;
}

function NotesField({ defaultValue }: { defaultValue?: string }) {
  const id = useId();
  return <Field><FieldLabel htmlFor={id}>Notas</FieldLabel><textarea id={id} className="min-h-20 w-full rounded-lg border border-input bg-background px-3 py-2 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50" name="notes" placeholder="Detalhes para você lembrar" defaultValue={defaultValue} /></Field>;
}

function CategorySplits({ categories, type, initial = [] }: { categories: CategoryOption[]; type?: "income" | "expense"; initial?: { categoryId: string | null; amountMinor: string }[] }) {
  const [rows, setRows] = useState(() => initial.length ? initial.map((_item, index) => index) : [0]);
  const [nextId, setNextId] = useState(initial.length || 1);
  const disabled = useContext(PendingContext);
  const options: [string, string][] = [["", "Sem categoria"], ...categories.map(category => [category.id, categoryPath(category, categories)] as [string, string])];
  return <FieldSet className="rounded-xl border p-3 sm:col-span-2"><FieldLegend>Categorias desta operação</FieldLegend><FieldGroup><p className="text-xs leading-5 text-muted-foreground">A soma das categorias deve ser igual ao valor total.</p>{rows.map((id, index) => <FieldGroup key={id} className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"><div className="min-w-0">{type ? <CategoryPicker label={`Categoria ${index + 1}`} name="allocationCategoryId" categories={categories} type={type} defaultValue={initial[index]?.categoryId ?? ""} disabled={disabled} /> : <FormField label={`Categoria ${index + 1}`} name="allocationCategoryId" required={false} options={options} defaultValue={initial[index]?.categoryId ?? ""} />}</div><FormField label="Valor (R$)" name="allocationAmount" placeholder="Ex.: 85,00" defaultValue={majorInputFromMinor(initial[index]?.amountMinor ?? null)} /><Button type="button" aria-label={`Remover categoria ${index + 1}`} disabled={rows.length === 1} onClick={() => setRows(current => current.filter(item => item !== id))} variant="outline" className="mb-px">−</Button></FieldGroup>)}<Button type="button" onClick={() => { setRows(current => [...current, nextId]); setNextId(value => value + 1); }} variant="outline" className="w-fit">＋ Outra categoria</Button></FieldGroup></FieldSet>;
}

function ReportingAccountField({ accounts, value, onChange }: {
  accounts: AccountOption[];
  value?: string;
  onChange?: React.ChangeEventHandler<HTMLInputElement | HTMLSelectElement>;
}) {
  const options: [string, string][] = [["", "Sem conta vinculada"]];
  for (const account of accounts) {
    if (account.type === "checking" || account.type === "savings") options.push([account.id, account.name]);
  }
  return <div className="grid gap-2 sm:col-span-2">
    <p className="text-sm text-muted-foreground">A conta vinculada inclui todo o histórico de gastos deste cartão.</p>
    <FormField label="Conta para relatórios" name="reportingAccountId" required={false} options={options} value={value} onChange={onChange} />
  </div>;
}

function CardSettingsFields({ accounts, onReady }: { accounts: AccountOption[]; onReady: (ready: boolean) => void }) {
  const cards = accounts.filter(account => account.type === "credit_card");
  const firstCardId = cards[0]?.id ?? "";
  const [accountId, setAccountId] = useState(firstCardId);
  useEffect(() => { if (!accountId && firstCardId) setAccountId(firstCardId); }, [accountId, firstCardId]);
  const [settings, setSettings] = useState({ creditLimitMinor: "", closingDay: "", dueDay: "", billingTimezone: "America/Sao_Paulo", billingMode: "manual", reportingAccountId: "" });
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    onReady(false);
    if (!accountId) return;
    const controller = new AbortController();
    setLoadError("");
    setSettings({ creditLimitMinor: "", closingDay: "", dueDay: "", billingTimezone: "America/Sao_Paulo", billingMode: "manual", reportingAccountId: "" });
    fetch(`/api/v1/cards/settings?accountId=${accountId}`, { cache: "no-store", signal: controller.signal }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error("Não foi possível carregar a configuração. Selecione o cartão novamente para tentar.");
      if (controller.signal.aborted) return;
      setSettings({ creditLimitMinor: majorInputFromMinor(result.data.creditLimitMinor), closingDay: String(result.data.closingDay), dueDay: String(result.data.dueDay), billingTimezone: result.data.billingTimezone, billingMode: result.data.billingMode, reportingAccountId: result.data.reportingAccountId ?? "" });
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
    <ReportingAccountField accounts={accounts} value={settings.reportingAccountId} onChange={update("reportingAccountId")} />
    {loadError && <Alert variant="destructive" className="sm:col-span-2"><AlertDescription>{loadError}</AlertDescription></Alert>}
  </>;
}

function AccountFields({ references }: { references: References }) {
  const [type, setType] = useState("checking");
  return <>
    <FormField label="Nome da conta ou cartão" name="name" placeholder="Ex.: Conta principal" />
    <FormField label="Tipo" name="type" options={[["checking", "Conta corrente"], ["savings", "Poupança"], ["cash", "Dinheiro"], ["credit_card", "Cartão de crédito"]]} value={type} onChange={event => setType(event.target.value)} />
    <input type="hidden" name="currency" value="BRL" />
    {type === "credit_card" && <Alert role="note" className="sm:col-span-2"><AlertDescription>Informe como saldo inicial negativo somente a dívida da fatura do ciclo de abertura. Deixe as parcelas futuras de fora.</AlertDescription></Alert>}
    <FormField label="Saldo inicial" name="openingBalanceMinor" placeholder={type === "credit_card" ? "-800,00" : "2500,00"} />
    <FormField label="Data do saldo inicial" name="openingDate" type="date" defaultValue={todayCivil()} />
    <FormField label="Instituição" name="institutionId" required={false} options={[["", "Sem instituição"], ...references.institutions.map(institution => [institution.id, institution.name] as [string, string])]} />
    {type === "credit_card" && <><FormField label="Limite do cartão (moeda do cartão)" name="creditLimitMinor" required={false} placeholder="Deixe em branco para sem limite" /><FormField label="Dia de fechamento" name="closingDay" type="number" min="1" /><FormField label="Dia de vencimento" name="dueDay" type="number" min="1" /><ReportingAccountField accounts={references.accounts} /></>}
  </>;
}

function OpeningDebtUnavailable({ accounts, onCorrectBalance }: { accounts: AccountOption[]; onCorrectBalance: () => void }) {
  const cards = accounts.filter(account => account.type === "credit_card" && !account.isArchived);
  if (cards.length === 0) return <p className="text-sm text-muted-foreground">Cadastre um cartão em Configurações para acompanhar suas faturas.</p>;
  const hasNonnegativeBalance = cards.some(card => card.openingBalanceMinor !== undefined && BigInt(card.openingBalanceMinor) >= 0n);
  return <div className="grid gap-3 text-sm">
    <p className="font-medium">Nenhum cartão disponível para vínculo</p><p className="text-muted-foreground">Para registrar um vínculo, o cartão precisa ter saldo inicial negativo. Cada cartão pode ter dívida inicial em uma única fatura.</p>
    <ul className="divide-y divide-border">
      {cards.map(card => <li key={card.id} className="flex flex-wrap justify-between gap-x-3 gap-y-1 py-2">
        <span className="min-w-0 break-words font-medium">{card.name}</span>
        <span className="text-muted-foreground">{card.openingBalanceMinor === undefined
          ? "Saldo inicial indisponível"
          : BigInt(card.openingBalanceMinor) >= 0n
            ? `Saldo inicial ${formatMinor(card.openingBalanceMinor, card.currency)}`
            : card.hasUnallocatedOpeningDebt === false ? "Dívida inicial já vinculada" : "Vínculo indisponível"}</span>
      </li>)}
    </ul>
    {hasNonnegativeBalance && <>
      <p className="text-muted-foreground">Se a dívida já existia na abertura e o saldo foi cadastrado incorretamente, corrija o saldo inicial e volte para vincular.</p>
      <Button type="button" variant="outline" className="min-h-11 justify-self-start" onClick={onCorrectBalance}>{actionLabels.correctOpeningBalance}</Button>
    </>}
  </div>;
}

function OpeningDebtFields({ references }: { references: References }) {
  const [cardId, setCardId] = useState("");
  const [amount, setAmount] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const busy = useContext(PendingContext);
  const cards = openingDebtCards(references);
  const card = cards.find(account => account.id === cardId);
  const openingBalance = BigInt(card?.openingBalanceMinor ?? "0");
  const fullAmount = openingBalance < 0n ? majorInputFromMinor((-openingBalance).toString()) : "";
  const source = references.statements.find(statement => statement.cardAccountId === cardId && statement.status === "open"
    && statement.openingDebtMinor && statement.items?.length === 0);
  const openStatements = source ? openingDebtMoveTargets(references.statements, source)
    : references.statements.filter(statement => statement.cardAccountId === cardId && statement.status === "open");
  function updateAmount(value: string) {
    setAmount(value);
    setConfirmed(false);
  }
  return <>
    <Alert role="note" className="sm:col-span-2"><AlertDescription>{source
      ? `Mova ${formatMinor(source.openingDebtMinor!, source.currency)} da fatura com vencimento em ${formatDate(source.dueOn)} para uma fatura anterior com lançamentos.`
      : "Vincule somente o valor ainda pendente da dívida de abertura. O valor entra uma vez na fatura, sem criar despesa nem alterar o saldo do cartão."}</AlertDescription></Alert>
    <FormField label="Cartão" name="cardAccountId" value={cardId} onChange={event => { setCardId(event.target.value); updateAmount(""); }} options={[["", "Selecione um cartão"], ...cards.map(card => [card.id, card.name] as [string, string])]} />
    <FormField key={cardId} label="Fatura aberta" name="statementId" required={Boolean(source)} options={[["", source ? "Selecione a fatura de destino" : "Usar fatura aberta com lançamentos"], ...openStatements.map(statement => [statement.id, `Vence em ${formatDate(statement.dueOn)}`] as [string, string])]} />
    {source ? <>
      <input type="hidden" name="sourceStatementId" value={source.id} />
      <input type="hidden" name="amountMinor" value={majorInputFromMinor(source.openingDebtMinor!)} />
    </> : <div className="grid min-w-0 gap-2 sm:col-span-2">
      <FormField label="Valor pendente" name="amountMinor" placeholder="800,00" value={amount} onChange={event => updateAmount(event.target.value)} />
      <Button type="button" variant="outline" className="min-h-11 justify-self-start" disabled={busy || !fullAmount} onClick={() => updateAmount(fullAmount)}>Usar valor inicial inteiro</Button>
    </div>}
    <Field orientation="horizontal" className="sm:col-span-2">
      <Input id="confirms-outstanding-debt" name="confirmsOutstandingDebt" type="checkbox" required className="size-5 min-h-5 w-5" disabled={busy} checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
      <FieldLabel htmlFor="confirms-outstanding-debt">{source ? "Confirmo que a dívida deve somar à fatura de destino" : "Confirmo que o valor ainda está pendente e não consta em outra fatura"}</FieldLabel>
    </Field>
  </>;
}

function PreviewSummary({ result, references, description, occurredOn }: { result: Record<string, unknown>; references: References; description: string; occurredOn: string }) {
  const entries = (result.entries ?? []) as { accountId: string; amountMinor: string }[];
  const allocations = (result.allocations ?? []) as { categoryId: string | null; amountMinor: string }[];
  const installments = (result.installments ?? []) as { number: number; amountMinor: string; closingOn: string; dueOn: string }[];
  const currency = references.accounts.find(account => account.id === entries[0]?.accountId)?.currency ?? "BRL";
  const statementAdjustment = result.operation === "statement_adjustment";
  const statementPayment = result.operation === "statement_payment";
  const targetStatement = (statementAdjustment || statementPayment) ? references.statements.find(statement => statement.id === result.statementId) : undefined;
  const effect = statementAdjustment ? "A diferença aumenta a dívida do cartão e entra como despesa do mês."
    : statementPayment ? "O valor sai da conta de origem e reduz o saldo a pagar da fatura."
    : "Confira os dados antes de confirmar.";
  const plannedStatement = (result.statementPlan ?? result.plannedStatement) as { cycleStartOn: string; closingOn: string; dueOn: string } | undefined;
  return <section className="sm:col-span-2 rounded-xl border border-border bg-muted p-4"><h3 className="font-semibold">Revise antes de gravar</h3><p className="mt-1 text-xs text-muted-foreground">{effect}</p><p className="mt-3 break-words text-sm">{description}</p><p className="text-xs text-muted-foreground">{formatDate(occurredOn)}</p>{entries.map((entry, index) => { const account = references.accounts.find(item => item.id === entry.accountId); return <p key={`${entry.accountId}-${index}`} className="mt-3 flex flex-wrap justify-between gap-3 text-sm [&>span]:min-w-0 [&>span]:break-words [&>strong]:max-w-full [&>strong]:break-words"><span>{account?.name ?? "Conta"}</span><strong className="tabular-nums">{formatMinor(entry.amountMinor, account?.currency ?? currency)}</strong></p>; })}{allocations.length > 0 && <div className="mt-3"><p className="text-xs font-medium text-muted-foreground">Alocação por categoria</p>{allocations.map((allocation, index) => { const category = references.categories.find(item => item.id === allocation.categoryId); return <p key={`${allocation.categoryId}-${index}`} className="mt-1 flex flex-wrap justify-between gap-3 text-sm [&>span]:min-w-0 [&>span]:break-words [&>strong]:max-w-full [&>strong]:break-words"><span>{category ? categoryPath(category, references.categories) : "Sem categoria"}</span><strong className="tabular-nums">{formatMinor(allocation.amountMinor, currency)}</strong></p>; })}</div>}{installments.length > 0 && <div className="mt-4"><p className="text-xs font-medium text-muted-foreground">Parcelas previstas</p><ul className="mt-2 grid gap-1">{installments.map(item => <li key={item.number} className="flex flex-wrap justify-between gap-3 text-sm [&>span]:min-w-0 [&>span]:break-words [&>strong]:max-w-full [&>strong]:break-words"><span>{item.number}/{installments.length} · vence {formatDate(item.dueOn)}</span><strong className="tabular-nums">{formatMinor(item.amountMinor, currency)}</strong></li>)}</ul></div>}{targetStatement && <p className="mt-3 text-sm">Fatura de {targetStatement.cardAccountName}, vencimento {formatDate(targetStatement.dueOn)}.</p>}{plannedStatement && <p className="mt-3 text-sm">A previsão abre um ciclo novo: {formatDate(plannedStatement.cycleStartOn)} a {formatDate(plannedStatement.closingOn)}, vencimento {formatDate(plannedStatement.dueOn)}.</p>}{typeof result.remainingStatementMinor === "string" && <p className="mt-3 text-sm">Saldo restante da fatura: <strong>{formatMinor(result.remainingStatementMinor, currency)}</strong></p>}</section>;
}

function ReversalReview({ transaction, references, reason, replacement }: { transaction: TransactionOption; references: References; reason: string; replacement: Record<string, unknown> | null }) {
  const accounts = references.accounts;
  return <section className="sm:col-span-2 rounded-xl border border-border bg-muted p-4"><h3 className="font-semibold">Revise o cancelamento antes de confirmar</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">A reversão cria uma compensação vinculada ao lançamento original e preserva seu histórico. Confira os valores, as contas e o motivo antes de confirmar.</p><h4 className="mt-4 text-xs font-semibold">Movimentação original</h4>{transaction.entries?.map((entry, index) => <p key={`${entry.accountId}-${index}`} className="mt-1 flex flex-wrap justify-between gap-3 text-sm [&>span]:min-w-0 [&>span]:break-words [&>strong]:max-w-full [&>strong]:break-words"><span>{entry.accountName}</span><strong className="tabular-nums">{formatMinor(entry.amountMinor, entry.currency)}</strong></p>)}<p className="mt-3 text-sm"><span className="font-medium">Motivo:</span> {reason}</p>{replacement && <><h4 className="mt-4 text-xs font-semibold">Lançamento substituto</h4><p className="text-sm">{String(replacement.description)} · {formatDate(String(replacement.occurredOn))}</p>{("accountId" in replacement) && <p className="mt-1 flex flex-wrap justify-between gap-3 text-sm [&>span]:min-w-0 [&>span]:break-words [&>strong]:max-w-full [&>strong]:break-words"><span>{accounts.find(account => account.id === replacement.accountId)?.name ?? "Conta"}</span><strong className="tabular-nums">{formatMinor(String(replacement.amountMinor), accounts.find(account => account.id === replacement.accountId)?.currency ?? "BRL")}</strong></p>}{("fromAccountId" in replacement) && <><p className="mt-1 flex flex-wrap justify-between gap-3 text-sm [&>span]:min-w-0 [&>span]:break-words [&>strong]:max-w-full [&>strong]:break-words"><span>{accounts.find(account => account.id === replacement.fromAccountId)?.name ?? "Origem"} → {accounts.find(account => account.id === replacement.toAccountId)?.name ?? "Destino"}</span><strong className="tabular-nums">{formatMinor(String(replacement.amountMinor), accounts.find(account => account.id === replacement.fromAccountId)?.currency ?? "BRL")}</strong></p></>}</>}</section>;
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
  return <><Alert role="note" className="sm:col-span-2"><AlertDescription>O cancelamento é definitivo e cria uma compensação, preservando o lançamento original. Não é possível reverter operações ligadas a cartões, faturas, reembolsos ou lançamentos já revertidos.</AlertDescription></Alert><FormField label="Data da compensação" name="occurredOn" type="date" defaultValue={todayCivil()} /><FormField label="Motivo" name="reason" placeholder="Ex.: lançamento duplicado" /><FormField label="Substituir por um novo lançamento?" name="replacementKind" required={false} value={replacementKind} onChange={event => setReplacementKind(event.target.value)} options={[["", "Não criar substituição"], ["income", "Nova receita"], ["expense", "Nova despesa"], ["transfer", "Nova transferência"]]} />{replacementKind && <><FormField label="Descrição do novo lançamento" name="replacementDescription" placeholder="Descreva o registro correto" /><FormField label="Data do novo lançamento" name="replacementOn" type="date" defaultValue={todayCivil()} /><FormField label="Valor (R$)" name="amountMinor" placeholder="85,00" />{replacementKind === "transfer" ? <><FormField label="Conta de origem" name="replacementFromAccountId" options={accountOptions(account => account.type !== "credit_card")} /><FormField label="Conta de destino" name="replacementToAccountId" options={accountOptions(account => account.type !== "credit_card")} /></> : <><FormField label="Conta" name="replacementAccountId" options={accountOptions(account => account.type !== "credit_card")} />{replacementKind === "income" ? <FormField label="Categoria" name="replacementCategoryId" required={false} options={[["", "Sem categoria"], ...categories.map(category => [category.id, category.name] as [string, string])]} /> : <><FormField label="Forma de pagamento" name="replacementPaymentMethod" options={[["pix", "Pix"], ["debit", "Débito"], ["cash", "Dinheiro"], ["other", "Outra"]]} /><CategorySplits categories={categories} /></>}</>}{<FormField label="Status do novo lançamento" name="replacementReviewStatus" options={[["confirmed", "Confirmado"], ["needs_review", "Precisa revisar"]]} />}</>}</>;
}

function StatementSummary({ statement }: { statement: StatementOption }) {
  const remaining = BigInt(statement.remainingMinor ?? "0");
  const credit = BigInt(statement.creditBalanceMinor ?? (remaining < 0n ? (-remaining).toString() : "0"));
  return <section aria-label="Resumo da fatura" className="grid min-w-0 gap-3 rounded-lg border border-border bg-background/50 p-3 sm:col-span-2">
    <p className="font-medium [overflow-wrap:anywhere]">{statement.cardAccountName}</p>
    <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
      {statement.closingOn && <div><dt className="text-xs text-muted-foreground">Fechamento</dt><dd>{formatDate(statement.closingOn)}</dd></div>}
      <div><dt className="text-xs text-muted-foreground">Vencimento</dt><dd>{formatDate(statement.dueOn)}</dd></div>
      {(statement.remainingMinor !== undefined || credit > 0n) && <div className="min-w-0"><dt className="text-xs text-muted-foreground">{credit > 0n ? "Crédito" : "Saldo a pagar"}</dt><dd className="font-mono font-medium tabular-nums [overflow-wrap:anywhere]">{formatCurrencyMinor((credit > 0n ? credit : remaining).toString(), statement.currency)}</dd></div>}
    </dl>
  </section>;
}

export function ActionDialog({ action, busy, message, close, submit, references, selectedTransaction, selectedForecast, initialStatementId, setAction, pendingPreview, pendingReverseReview, clearPreview, loading = false }: { loading?: boolean; action: Action; busy: boolean; message: string; close: (returnToEntries?: boolean) => void; submit: (event: FormEvent<HTMLFormElement>) => void; references: References; selectedTransaction: TransactionOption | null; selectedForecast: ExpenseForecastOption | null; initialStatementId?: string; setAction: (action: Action) => void; pendingPreview: { signature: string; data: Record<string, unknown> } | null; pendingReverseReview: { signature: string; reason: string; replacement: Record<string, unknown> | null } | null; clearPreview: () => void }) {
  const [returnFocus] = useState(() => typeof document === "undefined" ? null : document.activeElement as HTMLElement | null);
  const formId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const reviewRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const dialogTitleRef = useRef<HTMLHeadingElement>(null);
  const [reviewDetails, setReviewDetails] = useState({ description: "", occurredOn: "" });
  useEffect(() => {
    if (message) errorRef.current?.focus();
  }, [message]);
  useEffect(() => {
    if (pendingPreview) reviewRef.current?.focus();
  }, [pendingPreview]);
  const [cardSettingsReady, setCardSettingsReady] = useState(false);
  const [statementId, setStatementId] = useState(initialStatementId ?? "");
  const eligibleStatements = useMemo(() => action === "close"
    ? references.statements.filter(statement => statement.status === "open")
    : action === "payment" ? references.statements.filter(canPayStatement) : [], [action, references.statements]);
  const selectedStatement = eligibleStatements.find(statement => statement.id === statementId);
  const requiresStatement = action === "close" || action === "payment";
  const statementUnavailable = requiresStatement && !eligibleStatements.length;
  const [adjustmentCardId, setAdjustmentCardId] = useState(() => references.accounts.find(account => account.type === "credit_card")?.id ?? "");

  const fields = useMemo(() => {
    const accountOptions = (filter?: (account: AccountOption) => boolean): [string, string][] => references.accounts.filter(filter ?? (() => true)).map(account => [account.id, `${account.name} · ${account.currency}`]);
    const categoryOptions = (type?: "income" | "expense"): [string, string][] => references.categories.filter(category => !category.isArchived && (!type || category.type === type)).map(category => [category.id, category.name] as [string, string]);
    const statementOptions: [string, string][] = references.statements.map(statement => [statement.id, `${statement.cardAccountName} · vence ${formatDate(statement.dueOn)} · ${statement.status}`]);
    const statementDates = (statement: References["statements"][number]) => `vence ${formatDate(statement.dueOn)}${statement.closingOn ? ` · fecha ${formatDate(statement.closingOn)}` : ""}`;
    const purchaseOptions: [string, string][] = references.transactions.filter(transaction => transaction.kind === "expense").map(transaction => [transaction.id, `${transaction.description} · ${formatDate(transaction.occurredOn)}`]);
    const accountField = (label: string, name: string, filter?: (account: AccountOption) => boolean, required = true) => <FormField label={label} name={name} required={required} options={accountOptions(filter)} />;
    const descriptionField = <FormField label="Descrição" name="description" placeholder="Ex.: Mercado do mês" />;
    const operationDateField = <FormField label="Data da operação" name="occurredOn" type="date" defaultValue={todayCivil()} />;
    const details = <><FormField label="Data de postagem" name="postedOn" type="date" required={false} /><FormField label="Estabelecimento ou pessoa" name="counterpartyName" required={false} /><NotesField /><FormField label="Status da transação" name="reviewStatus" options={[["confirmed", "Confirmado"], ["needs_review", "Precisa revisar"]]} /></>;
    const shared = <>{descriptionField}{operationDateField}{details}</>;
    const optionalDetails = <details className="group sm:col-span-2">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm text-muted-foreground [&::-webkit-details-marker]:hidden"><ChevronDown aria-hidden="true" className="size-4 group-open:rotate-180" />Mais detalhes</summary>
      <div className="grid gap-4 pt-2 sm:grid-cols-2">{details}</div>
    </details>;
    const statementPicker = <FormField label="Fatura" name="statementId" className="sm:col-span-2" value={selectedStatement?.id ?? ""} onChange={event => setStatementId(event.target.value)} options={[
      ["", "Selecione uma fatura"],
      ...eligibleStatements.map(statement => [statement.id, `${statement.cardAccountName} · ${formatDate(statement.dueOn)}`] as [string, string]),
    ]} />;
    switch (action) {
      case "institution": return <FormField label="Nome da instituição" name="name" placeholder="Ex.: Banco do Brasil" />;
      case "correctOpeningBalance": return <OpeningBalanceFields accounts={references.accounts} />;
      case "allocateOpeningDebt": return <OpeningDebtFields references={references} />;
      case "account": return <AccountFields references={references} />;
      case "configureCard": return <CardSettingsFields accounts={references.accounts} onReady={setCardSettingsReady} />;
      case "category": return <><FormField label="Nome da categoria" name="name" placeholder="Ex.: Moradia" /><FormField label="Tipo" name="type" options={[["expense", "Despesa"], ["income", "Receita"]]} /><FormField label="Categoria superior" name="parentId" required={false} options={[["", "Sem categoria superior"], ...categoryOptions()]} /></>;
      case "income":
      case "expense":
      case "purchase": return <SimpleTransactionFields action={action} references={references} setAction={next => { clearPreview(); setAction(next); }} />;
      case "transfer": return <><FormField label="Valor (R$)" name="amountMinor" placeholder="500,00" />{accountField("Conta de origem", "fromAccountId", account => account.type !== "credit_card")}{accountField("Conta de destino", "toAccountId", account => account.type !== "credit_card")}{shared}</>;
      case "cashback": return <><FormField label="Valor (R$)" name="amountMinor" placeholder="25,00" />{accountField("Conta ou cartão", "accountId")}<CategoryPicker categories={references.categories} type="income" /><FormField label="Fatura (crédito no cartão)" name="cardStatementId" required={false} options={[["", "Nenhuma fatura"], ...statementOptions]} />{shared}</>;
      case "refund": return <><FormField label="Valor (R$)" name="amountMinor" placeholder="12,00" /><FormField label="Compra original" name="originalTransactionId" options={[["", "Selecione uma compra"], ...purchaseOptions]} />{accountField("Conta ou cartão", "accountId")}{shared}</>;
      case "statementAdjustment": return <>
        <FormField label="Diferença a acrescentar" name="amountMinor" prefix="R$" placeholder="0,00" help="Informe apenas a diferença que falta na fatura." />
        <FormField label="Cartão" name="cardAccountId" value={adjustmentCardId} onChange={event => setAdjustmentCardId(event.target.value)} options={accountOptions(account => account.type === "credit_card")} />
        {operationDateField}
        <FormField key={adjustmentCardId} label="Fatura aberta" name="statementId" className="sm:col-span-2" required={false} options={[["", "Usar ciclo da data informada"], ...references.statements.filter(statement => statement.status === "open" && statement.cardAccountId === adjustmentCardId).map(statement => [statement.id, statementDates(statement)] as [string, string])]} />
        <FormField label="Descrição" name="description" placeholder="Ex.: Diferença da fatura de novembro" className="sm:col-span-2" />
        <Field orientation="horizontal" className="rounded-lg border border-border bg-background/50 p-3 sm:col-span-2">
          <Input id="confirms-unrecorded-debt" name="confirmsUnrecordedDebt" type="checkbox" required className="size-5 min-h-5 w-5 shrink-0" />
          <FieldLabel htmlFor="confirms-unrecorded-debt">Confirmo que este valor não está incluído no saldo inicial nem em outros lançamentos do cartão.</FieldLabel>
        </Field>
        {optionalDetails}
      </>;
      case "payment": return statementUnavailable ? <p className="text-sm text-muted-foreground sm:col-span-2">Nenhuma fatura fechada tem saldo a pagar.</p> : <>
        {statementPicker}
        {selectedStatement && <StatementSummary statement={selectedStatement} />}
        <FormField label="Valor do pagamento" name="amountMinor" prefix="R$" placeholder="0,00" help="Informe o valor a pagar. Você pode pagar parte do saldo." />
        {accountField("Conta de origem", "fromAccountId", account => account.type !== "credit_card")}
        {operationDateField}
        <FormField label="Descrição" name="description" placeholder="Ex.: Pagamento da fatura" className="sm:col-span-2" />
        {optionalDetails}
      </>;
      case "close": return statementUnavailable ? <p className="text-sm text-muted-foreground sm:col-span-2">Nenhuma fatura aberta para fechar.</p> : <>
        {statementPicker}
        {selectedStatement && <StatementSummary statement={selectedStatement} />}
      </>;
      case "forecast": return <><Alert role="note" className="sm:col-span-2"><AlertDescription>Uma previsão não cria lançamento nem altera saldo ou relatório. Ao realizar, o sistema registra uma despesa usando o mesmo valor e categoria.</AlertDescription></Alert><FormField label="Descrição" name="description" placeholder="Ex.: Seguro do carro" /><FormField label="Data esperada" name="expectedOn" type="date" defaultValue={todayCivil()} /><FormField label="Valor (R$)" name="amountMinor" placeholder="250,00" />{accountField("Conta de pagamento", "accountId", account => account.type !== "credit_card")}<CategoryPicker categories={references.categories} type="expense" /></>;
      case "realizeForecast": return <><Alert role="note" className="sm:col-span-2"><AlertDescription>{selectedForecast?.description} · {selectedForecast && formatMinor(selectedForecast.amountMinor, selectedForecast.currency)} · prevista para {selectedForecast ? formatDate(selectedForecast.expectedOn) : ""}. Realizar registra agora uma despesa e altera o saldo da conta.</AlertDescription></Alert><FormField label="Data da despesa" name="occurredOn" type="date" defaultValue={todayCivil()} /><FormField label="Data de postagem" name="postedOn" type="date" required={false} /><FormField label="Forma de pagamento" name="paymentMethod" options={[["pix", "Pix"], ["debit", "Débito"], ["cash", "Dinheiro"], ["other", "Outra"]]} /><FormField label="Status" name="reviewStatus" options={[["confirmed", "Confirmado"], ["needs_review", "Precisa revisar"]]} /></>;
      case "cancelForecast": return <Alert role="note" className="sm:col-span-2"><AlertDescription>Cancelar “{selectedForecast?.description}” ({selectedForecast && formatMinor(selectedForecast.amountMinor, selectedForecast.currency)}) em {selectedForecast ? formatDate(selectedForecast.expectedOn) : ""}? O histórico continuará registrado e nenhum saldo será alterado.</AlertDescription></Alert>;
      case "correct": return selectedTransaction ? <CorrectionFields key={selectedTransaction.id} transaction={selectedTransaction} references={references} /> : <p>Selecione um lançamento para corrigir.</p>;
      case "reverse": return selectedTransaction ? <><Alert role="note" className="sm:col-span-2"><AlertDescription>Original: <strong>{selectedTransaction.description}</strong> · {formatDate(selectedTransaction.occurredOn)}. A reversão e eventual substituição serão revistas antes do envio.</AlertDescription></Alert><ReversalFields key={selectedTransaction.id} references={references} /></> : <p>Selecione um lançamento para reverter.</p>;
    }
  }, [action, references, selectedTransaction, selectedForecast, adjustmentCardId, eligibleStatements, selectedStatement, statementUnavailable]);

  const simpleTransaction = action === "income" || action === "expense" || action === "purchase";
  const missingTransactionAccount = !loading && simpleTransaction && !references.accounts.some(account => action === "purchase" ? account.type === "credit_card" : account.type !== "credit_card");
  const typePicker = (!requiresStatement && action !== "statementAdjustment") && !selectedTransaction && !selectedForecast && !settingsActions.includes(action) && (simpleTransaction ? <TransactionKindPicker action={action} setAction={setAction} clearPreview={clearPreview} busy={busy || loading} /> : <FormField label="Tipo de registro" name="actionType" value={action} onChange={event => { clearPreview(); setAction(event.target.value as Action); }} options={primaryActions.map(key => [key, actionLabels[key]])} />);
  const openingDebtUnavailable = action === "allocateOpeningDebt" && openingDebtCards(references).length === 0;
  const submitting = busy ? (action === "close" ? "Fechando…" : pendingPreview ? "Salvando…" : "Validando…") : "";
  const submitLabel = pendingReverseReview ? "Confirmar reversão" : pendingPreview ? "Confirmar e salvar"
    : action === "payment" ? "Revisar pagamento" : action === "statementAdjustment" ? "Revisar ajuste"
    : ["income", "expense", "transfer", "purchase", "cashback", "refund"].includes(action) ? "Revisar transação"
    : action === "cancelForecast" ? "Confirmar cancelamento" : action === "reverse" ? "Revisar reversão" : actionLabels[action];
  const actions = !openingDebtUnavailable && <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 border-t bg-card px-4 py-3 sm:flex sm:justify-end sm:px-5 [&>button]:h-auto [&>button]:whitespace-normal">
    {pendingPreview && <Button type="button" variant="outline" disabled={busy} onClick={() => { clearPreview(); requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>("input:not([type=hidden]),select")?.focus()); }}>Editar dados</Button>}
    {!pendingPreview && <Button type="button" onClick={() => close()} disabled={busy} variant="outline">Cancelar</Button>}
    {!statementUnavailable && !missingTransactionAccount && <Button type="submit" form={formId} disabled={busy || loading || (requiresStatement && !selectedStatement) || (action === "configureCard" && !cardSettingsReady)}>{submitting || submitLabel}</Button>}
  </div>;
  const form = openingDebtUnavailable ? <OpeningDebtUnavailable accounts={references.accounts} onCorrectBalance={() => setAction("correctOpeningBalance")} /> : <>
    <span role="status" className="sr-only">{busy ? "Processando operação" : ""}</span>
    <form ref={formRef} id={formId} className="flex flex-col gap-4" onChange={clearPreview} onSubmit={event => {
      const data = new FormData(event.currentTarget);
      setReviewDetails({ description: String(data.get("description") ?? ""), occurredOn: String(data.get("occurredOn") ?? "") });
      submit(event);
    }} aria-busy={busy}>
      <fieldset hidden={Boolean(pendingPreview)} disabled={busy || loading} className="min-w-0 border-0 p-0">
        <FieldGroup key={action === "income" || action === "expense" || action === "purchase" ? "transaction" : action} className={`grid grid-cols-1 sm:grid-cols-2 ${simpleTransaction ? "gap-3" : "gap-4"}`}>{fields}</FieldGroup>
      </fieldset>
      {pendingPreview && <div ref={reviewRef} tabIndex={-1} className="outline-none"><PreviewSummary result={pendingPreview.data} references={references} {...reviewDetails} /></div>}
      {pendingReverseReview && selectedTransaction && <ReversalReview transaction={selectedTransaction} references={references} reason={pendingReverseReview.reason} replacement={pendingReverseReview.replacement} />}
      {message && <Alert ref={errorRef} tabIndex={-1} role="alert" variant="destructive"><AlertDescription>{message}</AlertDescription></Alert>}
    </form>
  </>;
  const title = action === "income" || action === "expense" ? "Nova transação" : actionLabels[action];
  const settingsDescriptions: Partial<Record<Action, string>> = { institution: "Cadastre uma instituição para organizar suas contas.", account: "Cadastre uma conta ou cartão e informe o saldo de abertura.", category: "Cadastre uma categoria para classificar seus lançamentos.", configureCard: "Ajuste o limite e as datas de fechamento e vencimento.", correctOpeningBalance: "Corrija o saldo registrado na abertura da conta ou cartão.", allocateOpeningDebt: "Vincule a dívida inicial do cartão a uma fatura." };
  const description = openingDebtUnavailable ? "Confira por que os cartões estão indisponíveis." : settingsDescriptions[action] ?? (action === "close" ? "Fechar encerra este ciclo. O pagamento é registrado separadamente." : action === "payment" ? "Registre um pagamento total ou parcial da fatura." : action === "statementAdjustment" ? "A diferença aumenta a dívida do cartão e entra como despesa do mês." : action === "cancelForecast" ? "Confira a previsão antes de cancelar." : action === "realizeForecast" ? "Confira os dados para realizar a previsão." : action === "correct" ? "Atualize os dados ou a categoria do lançamento." : action === "reverse" ? "Confira o lançamento antes de cancelar." : "Confira os dados da operação.");

  return <PendingContext value={busy || loading}><Dialog open onOpenChange={open => { if (!open && !busy) close(); }}>
    <DialogContent showCloseButton={false} className={`grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 ${action === "close" || simpleTransaction ? "sm:max-w-lg" : "sm:max-w-xl"}`} finalFocus={returnFocus ? { current: returnFocus } : true} initialFocus={() => formRef.current?.querySelector<HTMLElement>("input:not([type=hidden]):not(:disabled),select:not(:disabled),textarea:not(:disabled)") ?? dialogTitleRef.current ?? true}>
      <DialogHeader className="relative gap-1 border-b border-border px-4 py-3 pr-14 sm:px-5 sm:pr-14">
        <DialogTitle ref={dialogTitleRef} tabIndex={-1} className="outline-none">{title}</DialogTitle>
        <DialogDescription className={simpleTransaction ? "sr-only" : undefined}>{simpleTransaction ? "Preencha os dados e revise a transação antes de salvar." : description}</DialogDescription>
        <Button type="button" variant="ghost" size="icon" disabled={busy} onClick={() => close()} aria-label="Fechar" className="absolute top-1.5 right-2"><XIcon aria-hidden="true" /></Button>
      </DialogHeader>
      <div data-slot="action-dialog-body" className="grid min-h-0 min-w-0 content-start gap-4 overflow-y-auto overscroll-contain px-4 py-4 [scroll-padding-block:1rem] sm:px-5">
        {!pendingPreview && typePicker}
        {loading ? <p role="status" className="text-sm text-muted-foreground">Carregando formulário…</p>
          : missingTransactionAccount ? <div className="grid gap-2">
              <p>{action === "purchase" ? "Cadastre um cartão para registrar compras no crédito." : "Cadastre uma conta para registrar transações."}</p>
              <Link href="/settings" onClick={() => close(false)} className="inline-flex min-h-11 w-fit items-center text-primary hover:underline">Ir para configurações</Link>
            </div>
          : form}
      </div>
      {actions}
    </DialogContent>
  </Dialog></PendingContext>;
}
