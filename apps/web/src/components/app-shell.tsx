"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import logo from "../../marvin-logo.webp";
import { ArrowDownUpIcon, ChartNoAxesCombinedIcon, CreditCardIcon, HouseIcon, LogOutIcon, PlusCircleIcon, ReceiptTextIcon, WalletIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { actionLabels, primaryActions, type Action, type Section } from "./workspace-types";

const navigation = [
  { id: "overview", href: "/", label: "Início", mobileLabel: "Início", icon: HouseIcon },
  { id: "new", href: "/new", label: "Nova transação", mobileLabel: "Nova", icon: PlusCircleIcon },
  { id: "entries", href: "/entries", label: "Transações", mobileLabel: "Transações", icon: ArrowDownUpIcon },
  { id: "accounts", href: "/accounts", label: "Contas", mobileLabel: "Contas", icon: WalletIcon },
  { id: "cards", href: "/cards", label: "Cartões", mobileLabel: "Cartões", icon: CreditCardIcon },
  { id: "statements", href: "/statements", label: "Faturas", mobileLabel: "Faturas", icon: ReceiptTextIcon },
  { id: "reports", href: "/reports", label: "Relatórios", mobileLabel: "Relatórios", icon: ChartNoAxesCombinedIcon },
] as const;

export function AppShell({ section, title, description, onCreate, onSignOut, createDisabled, children }: { section: Section; title: string; description: string; onCreate: (action: Action) => void; onSignOut: () => void; createDisabled?: boolean; children: ReactNode }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const mobileNavigation = navigation.filter(item => ["overview", "entries", "new", "reports"].includes(item.id));
  return <div className="min-h-dvh md:grid md:grid-cols-[16rem_minmax(0,1fr)]">
    <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:p-3 focus:text-primary-foreground">Ir para o conteúdo</a>
    <aside className="sticky top-0 hidden h-dvh flex-col border-r border-sidebar-border bg-sidebar px-3 md:flex">
      <Link href="/" className="flex min-h-16 items-center gap-2 border-b border-sidebar-border px-3"><Brand /><span className="text-sm font-semibold tracking-tight">Marvin Finanças<span className="block font-mono text-[10px] font-normal tracking-wider text-muted-foreground">OBSIDIAN LEDGER</span></span></Link>
      <p className="px-2 pt-6 font-mono text-[10px] tracking-widest text-muted-foreground">NAVEGAÇÃO</p><nav aria-label="Navegação principal" className="flex flex-col gap-1 py-3">{navigation.map(item => <Link key={item.id} href={item.href} aria-current={section === item.id ? "page" : undefined} className={cn("flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground", section === item.id ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground")}><item.icon className="size-4" aria-hidden="true" />{item.label}</Link>)}</nav>
      <div className="mt-auto border-t border-sidebar-border py-4"><Button variant="ghost" onClick={onSignOut} className="w-full justify-start"><LogOutIcon data-icon="inline-start" />Sair</Button></div>
    </aside>
    <div className="min-w-0 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-0">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-3 px-4 pt-[env(safe-area-inset-top)] sm:px-6 lg:px-6">
          <Link href="/" aria-label="Marvin, início" className="flex items-center gap-2 md:hidden"><Brand /><span><span className="block font-mono text-[10px] tracking-widest text-muted-foreground">MARVIN</span><span className="block text-xl font-medium tracking-tight">{title}</span></span></Link>
          <Link href="/entries" className="hidden min-h-9 w-64 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-xs text-muted-foreground md:flex"><ArrowDownUpIcon className="size-3.5" aria-hidden="true" />Buscar transações…</Link>
          <div className="flex min-w-0 items-center gap-2">
            <NativeSelect disabled={createDisabled} aria-label="Criar novo registro" value="" onChange={event => { if (event.target.value) onCreate(event.target.value as Action); }} className="hidden max-w-48 md:flex"><NativeSelectOption value="">Novo registro</NativeSelectOption>{primaryActions.map(action => <NativeSelectOption key={action} value={action}>{actionLabels[action]}</NativeSelectOption>)}</NativeSelect>
            <Link href="/new" aria-label="Nova transação" className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-surface md:hidden"><PlusCircleIcon className="size-5" aria-hidden="true" /></Link>
          </div>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-7xl px-4 py-6 outline-none sm:px-6 lg:px-6 lg:py-6">
        <div className={cn("mb-6 flex flex-col gap-2", section === "new" && "sr-only")}><span className="hidden font-mono text-[10px] tracking-widest text-primary md:block">● SISTEMA OPERACIONAL FINANCEIRO</span><h1 className="sr-only text-2xl font-semibold tracking-tight md:not-sr-only lg:text-3xl">{title}</h1><p className="hidden max-w-2xl text-sm leading-6 text-muted-foreground md:block">{description}</p></div>
        {children}
      </main>
    </div>
    {moreOpen && <div className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 rounded-xl border border-border bg-popover p-3 shadow-xl md:hidden"><nav aria-label="Mais opções" className="grid grid-cols-2 gap-2">{navigation.filter(item => !mobileNavigation.some(link => link.id === item.id)).map(item => <Link key={item.id} href={item.href} onClick={() => setMoreOpen(false)} className="flex min-h-12 items-center gap-2 rounded-lg px-3 hover:bg-accent"><item.icon className="size-4" />{item.label}</Link>)}</nav><Button variant="ghost" className="mt-2 w-full" onClick={onSignOut}><LogOutIcon />Sair</Button></div>}
    <nav aria-label="Navegação principal móvel" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-background/95 px-1 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-sm md:hidden">{mobileNavigation.map(item => <Link key={item.id} href={item.href} aria-current={section === item.id ? "page" : undefined} className={cn("flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-0.5 text-[11px]", section === item.id ? "bg-accent text-primary" : "text-muted-foreground")}><item.icon className="size-5" aria-hidden="true" /><span>{item.mobileLabel}</span></Link>)}<button type="button" aria-expanded={moreOpen} aria-label="Mais opções" onClick={() => setMoreOpen(!moreOpen)} className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-[11px] text-muted-foreground"><WalletIcon className="size-5" aria-hidden="true" />Mais</button></nav>
  </div>;
}

export function Brand() {
  return <Image src={logo} alt="" aria-hidden="true" className="size-8 shrink-0 rounded-lg object-contain" />;
}
