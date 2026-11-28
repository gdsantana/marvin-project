"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import logo from "../../marvin-logo.webp";
import { ArrowDownUpIcon, ChartNoAxesCombinedIcon, CreditCardIcon, EllipsisIcon, HouseIcon, LogOutIcon, PlusCircleIcon, PlusIcon, ReceiptTextIcon, SettingsIcon, WalletIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { actionLabels, primaryActionGroups, type Action, type Section } from "./workspace-types";

const settingsNavigation = { id: "settings", href: "/settings", label: "Configurações", mobileLabel: "Configurações", icon: SettingsIcon } as const;
const navigation = [
  { id: "overview", href: "/", label: "Início", mobileLabel: "Início", icon: HouseIcon },
  { id: "entries", href: "/entries", label: "Transações", mobileLabel: "Transações", icon: ArrowDownUpIcon },
  { id: "accounts", href: "/accounts", label: "Contas", mobileLabel: "Contas", icon: WalletIcon },
  { id: "cards", href: "/cards", label: "Cartões", mobileLabel: "Cartões", icon: CreditCardIcon },
  { id: "statements", href: "/statements", label: "Faturas", mobileLabel: "Faturas", icon: ReceiptTextIcon },
  { id: "reports", href: "/reports", label: "Relatórios", mobileLabel: "Relatórios", icon: ChartNoAxesCombinedIcon },
  settingsNavigation,
] as const;

const sidebarLinkClass = "flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-2 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground xl:gap-3 xl:px-3 aria-[current=page]:bg-sidebar-accent aria-[current=page]:text-sidebar-accent-foreground";
const mobileNavigation = navigation.filter(item => ["overview", "entries", "reports"].includes(item.id));
const mobileNew = { id: "new", icon: PlusCircleIcon } as const;
const moreNavigation = navigation.filter(item => !mobileNavigation.some(link => link.id === item.id));

export function AppShell({ section, title, description, compact = false, headerControl, beforeTitle, showOperations = true, onCreate, onSignOut, createDisabled, newTransactionDisabled, children }: { section: Section; title: string; description: string; compact?: boolean; headerControl?: ReactNode; beforeTitle?: ReactNode; showOperations?: boolean; onCreate: (action: Action) => void; onSignOut: () => void; createDisabled?: boolean; newTransactionDisabled?: boolean; children: ReactNode }) {
  const pathname = usePathname();
  const isOverview = section === "overview";
  const compactContent = compact || section === "reports";
  return <div className="min-h-dvh md:grid md:grid-cols-[12rem_minmax(0,1fr)] xl:grid-cols-[16rem_minmax(0,1fr)]">
    <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:p-3 focus:text-primary-foreground">Ir para o conteúdo</a>
    <aside className="sticky top-0 hidden h-dvh flex-col border-r border-sidebar-border bg-sidebar md:flex">
      <Link href="/" className="flex min-h-16 shrink-0 items-center gap-2.5 border-b border-sidebar-border px-4 xl:px-6">
        <Brand />
        <span className="text-sm font-semibold leading-tight">Marvin Finanças</span>
      </Link>
      <nav aria-label="Navegação principal" className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain px-3 py-3">
        {navigation.filter(item => item.id !== "settings").map(item => <Link key={item.id} href={item.href} aria-current={section === item.id ? "page" : undefined} className={cn(sidebarLinkClass, "text-muted-foreground")}><item.icon className="size-4 shrink-0" aria-hidden="true" />{item.label}</Link>)}
      </nav>
      <nav aria-label="Configurações e sessão" className="grid shrink-0 gap-1 px-3 py-2 xl:pb-4">
        <Link href={settingsNavigation.href} aria-current={section === settingsNavigation.id ? "page" : undefined} className={cn(sidebarLinkClass, "text-muted-foreground")}><SettingsIcon className="size-4 shrink-0" aria-hidden="true" />{settingsNavigation.label}</Link>
        <Button variant="ghost" onClick={onSignOut} className="justify-start gap-2 px-2 font-normal text-muted-foreground xl:gap-3 xl:px-3"><LogOutIcon className="size-4" aria-hidden="true" />Sair</Button>
      </nav>
    </aside>
    <div className="min-w-0 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-0">
      <header className="sticky top-0 z-20 bg-sidebar/95 backdrop-blur-sm after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-sidebar-border">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-3 px-4 pt-[env(safe-area-inset-top)] sm:px-6 lg:px-6">
          <Link href="/" aria-label="Marvin, início" className="flex min-w-0 items-center gap-2 md:hidden"><Brand />{isOverview ? <span className="text-sm font-semibold">Marvin Finanças</span> : <span className="min-w-0"><span className="block font-mono text-[10px] tracking-widest text-muted-foreground">MARVIN</span><span className="block text-xl font-medium tracking-tight [overflow-wrap:anywhere]">{title}</span></span>}</Link>
          {headerControl}
          <div className="ml-auto hidden min-w-0 items-center gap-2 md:flex">
            {showOperations && <NativeSelect disabled={createDisabled} aria-label="Outras operações" value="" onChange={event => { if (event.target.value) onCreate(event.target.value as Action); }} className="w-40 [&>select]:border-sidebar-border [&>select]:bg-transparent [&>select]:text-sm [&>select:hover]:bg-muted pointer-fine:[&>select]:min-h-9">
              <NativeSelectOption value="" disabled>Outras operações</NativeSelectOption>
              {primaryActionGroups.map(group => <NativeSelectOptGroup key={group.label} label={group.label}>
                {group.actions.map(action => <NativeSelectOption key={action} value={action}>{actionLabels[action]}</NativeSelectOption>)}
              </NativeSelectOptGroup>)}
            </NativeSelect>}
            <Button type="button" aria-haspopup="dialog" disabled={newTransactionDisabled} onClick={event => { event.currentTarget.focus(); onCreate("expense"); }} className="gap-1.5 px-3 pointer-fine:min-h-9"><PlusIcon className="size-3.5" aria-hidden="true" />Nova transação</Button>
          </div>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className={cn("mx-auto max-w-7xl px-4 outline-none sm:px-6", isOverview || compactContent ? "py-4" : "py-6")}>
        {beforeTitle}
        {isOverview ? <h1 className="sr-only">{title}</h1> : <div className={cn("flex flex-col gap-2", compactContent ? "md:mb-4" : "mb-6")}>
          <h1 className="sr-only text-2xl font-semibold tracking-tight [overflow-wrap:anywhere] md:not-sr-only lg:text-3xl">{title}</h1>
          {description && <p className="hidden max-w-2xl text-sm leading-6 text-muted-foreground md:block">{description}</p>}
        </div>}
        <div key={pathname} className="page-enter">{children}</div>
      </main>
    </div>
    <MobileNavigation section={section} onSignOut={onSignOut} createDisabled={newTransactionDisabled} onNew={() => onCreate("expense")} />
  </div>;
}

function MobileNavigation({ section, onSignOut, onNew, createDisabled }: { section: Section; onSignOut: () => void; onNew: () => void; createDisabled?: boolean }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const moreActive = moreNavigation.some(item => item.id === section);

  useEffect(() => setMoreOpen(false), [pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    function closeOnOutsidePress(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setMoreOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress);
  }, [moreOpen]);

  return <div ref={root} className="md:hidden" onBlur={event => {
    if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) setMoreOpen(false);
  }} onKeyDown={event => {
    if (event.key !== "Escape" || !moreOpen) return;
    event.preventDefault();
    setMoreOpen(false);
    trigger.current?.focus();
  }}>
    <nav aria-label="Navegação principal móvel" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-background/95 px-1 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-sm">
      {[...mobileNavigation.slice(0, 2), mobileNew, ...mobileNavigation.slice(2)].map(item => item.id === "new"
        ? <Button key={item.id} variant="ghost" type="button" disabled={createDisabled} aria-label="Nova transação" aria-haspopup="dialog" onClick={event => { event.currentTarget.focus(); setMoreOpen(false); onNew(); }} className="h-auto min-h-12 min-w-0 flex-col gap-1 rounded-lg px-0.5 text-[11px] font-normal text-muted-foreground"><item.icon className="size-5" aria-hidden="true" />Nova</Button>
        : <Link key={item.id} href={item.href} aria-current={section === item.id ? "page" : undefined} onClick={() => setMoreOpen(false)} className={cn("flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-0.5 text-[11px]", section === item.id ? "bg-accent text-primary" : "text-muted-foreground")}><item.icon className="size-5" aria-hidden="true" /><span>{item.mobileLabel}</span></Link>)}
      <button ref={trigger} type="button" aria-expanded={moreOpen} aria-controls="mobile-more-navigation" aria-label="Mais opções" onClick={() => setMoreOpen(!moreOpen)} className={cn("flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-[11px]", moreActive || moreOpen ? "bg-accent text-primary" : "text-muted-foreground")}><EllipsisIcon className="size-5" aria-hidden="true" />Mais</button>
    </nav>
    <div id="mobile-more-navigation" hidden={!moreOpen} className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 max-h-[calc(100dvh-7rem-env(safe-area-inset-bottom))] overflow-y-auto rounded-xl border border-border bg-popover p-3 shadow-xl">
      <nav aria-label="Mais opções" className="grid grid-cols-2 gap-2">
        {moreNavigation.map(item => <Link key={item.id} href={item.href} aria-current={section === item.id ? "page" : undefined} onClick={() => { setMoreOpen(false); trigger.current?.focus(); }} className={cn("flex min-h-12 items-center gap-2 rounded-lg px-2 text-sm hover:bg-accent", section === item.id && "bg-accent text-primary")}><item.icon className="size-4 shrink-0" aria-hidden="true" />{item.label}</Link>)}
      </nav>
      <Button variant="ghost" className="mt-2 w-full" onClick={onSignOut}><LogOutIcon aria-hidden="true" />Sair</Button>
    </div>
  </div>;
}

export function Brand() {
  return <Image src={logo} alt="" aria-hidden="true" className="size-8 shrink-0 rounded-lg object-contain" />;
}
