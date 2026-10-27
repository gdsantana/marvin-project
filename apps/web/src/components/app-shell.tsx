"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import logo from "../../marvin-logo.webp";
import { ArrowDownUpIcon, ChartNoAxesCombinedIcon, CreditCardIcon, HouseIcon, LogOutIcon, ReceiptTextIcon, WalletIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { actionLabels, primaryActions, type Action, type Section } from "./workspace-types";

const navigation = [
  { id: "overview", href: "/", label: "Visão geral", mobileLabel: "Início", icon: HouseIcon },
  { id: "entries", href: "/entries", label: "Lançamentos", mobileLabel: "Extrato", icon: ArrowDownUpIcon },
  { id: "accounts", href: "/accounts", label: "Contas", mobileLabel: "Contas", icon: WalletIcon },
  { id: "cards", href: "/cards", label: "Cartões", mobileLabel: "Cartões", icon: CreditCardIcon },
  { id: "statements", href: "/statements", label: "Faturas", mobileLabel: "Faturas", icon: ReceiptTextIcon },
  { id: "reports", href: "/reports", label: "Relatórios", mobileLabel: "Relatórios", icon: ChartNoAxesCombinedIcon },
] as const;

export function AppShell({ section, title, description, onCreate, onSignOut, createDisabled, children }: { section: Section; title: string; description: string; onCreate: (action: Action) => void; onSignOut: () => void; createDisabled?: boolean; children: ReactNode }) {
  return <div className="min-h-dvh md:grid md:grid-cols-[16rem_minmax(0,1fr)]">
    <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:p-3 focus:text-primary-foreground">Ir para o conteúdo</a>
    <aside className="sticky top-0 hidden h-dvh flex-col border-r border-sidebar-border bg-sidebar px-3 md:flex">
      <Link href="/" className="flex min-h-20 items-center gap-3 border-b border-sidebar-border px-3"><Brand /><span className="text-lg font-semibold tracking-tight">marvin<span className="block text-xs font-normal text-muted-foreground">Finanças pessoais</span></span></Link>
      <nav aria-label="Navegação principal" className="flex flex-col gap-1 py-6">{navigation.map(item => <Link key={item.id} href={item.href} aria-current={section === item.id ? "page" : undefined} className={cn("flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground", section === item.id ? "bg-sidebar-accent text-primary" : "text-muted-foreground")}><item.icon className="size-4" aria-hidden="true" />{item.label}</Link>)}</nav>
      <div className="mt-auto border-t border-sidebar-border py-4"><Button variant="ghost" onClick={onSignOut} className="w-full justify-start"><LogOutIcon data-icon="inline-start" />Sair</Button></div>
    </aside>
    <div className="min-w-0 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-0">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="mx-auto flex min-h-20 max-w-7xl items-center justify-between gap-3 px-4 pt-[env(safe-area-inset-top)] sm:px-6 lg:px-8">
          <Link href="/" aria-label="Marvin, início" className="md:hidden"><Brand /></Link>
          <span className="hidden text-sm text-muted-foreground md:block">Marvin <span aria-hidden="true" className="mx-2">/</span><span className="text-foreground">{title}</span></span>
          <div className="flex min-w-0 items-center gap-2">
            <NativeSelect disabled={createDisabled} aria-label="Criar novo registro" value="" onChange={event => { if (event.target.value) onCreate(event.target.value as Action); }} className="max-w-48"><NativeSelectOption value="">Novo registro</NativeSelectOption>{primaryActions.map(action => <NativeSelectOption key={action} value={action}>{actionLabels[action]}</NativeSelectOption>)}</NativeSelect>
            <Button variant="ghost" size="icon" aria-label="Sair" onClick={onSignOut} className="md:hidden"><LogOutIcon /></Button>
          </div>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-7xl px-4 py-6 outline-none sm:px-6 lg:px-8 lg:py-8">
        <div className="mb-6 flex flex-col gap-2"><h1 className="text-2xl font-semibold tracking-tight lg:text-3xl">{title}</h1><p className="max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p></div>
        {children}
      </main>
    </div>
    <nav aria-label="Navegação principal móvel" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-border bg-background/95 px-1 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-sm md:hidden">{navigation.map(item => <Link key={item.id} href={item.href} aria-current={section === item.id ? "page" : undefined} className={cn("flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-0.5 text-[10px]", section === item.id ? "bg-accent text-primary" : "text-muted-foreground")}><item.icon className="size-5" aria-hidden="true" /><span>{item.mobileLabel}</span></Link>)}</nav>
  </div>;
}

export function Brand() {
  return <Image src={logo} alt="" aria-hidden="true" className="size-10 shrink-0 object-contain" />;
}
