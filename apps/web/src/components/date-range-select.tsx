"use client";

import { useState } from "react";
import { ArrowRightIcon, CalendarDaysIcon, ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type DateRange = { from: string; to: string };

export function DateRangeSelect({ value, onChange }: { value: DateRange; onChange: (value: DateRange) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);

  return <Dialog open={open} onOpenChange={next => { if (next) setDraft(value); setOpen(next); }}>
    <DialogTrigger render={<Button variant="outline" className="h-auto w-full justify-between gap-3 px-3 py-3" />}>
      <CalendarDaysIcon aria-hidden="true" />
      <span className="flex min-w-0 flex-1 flex-wrap items-center justify-center gap-x-3 gap-y-1 tabular-nums">
        <span className="sr-only">Período de </span>
        <span>{shortDate(value.from)}</span>
        <ArrowRightIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
        <span className="sr-only"> até </span>
        <span>{shortDate(value.to)}</span>
      </span>
      <ChevronDownIcon aria-hidden="true" className="text-muted-foreground" />
    </DialogTrigger>
    <DialogContent>
      <form className="grid gap-5" onSubmit={event => {
        event.preventDefault();
        if (!draft.from || !draft.to || draft.from > draft.to) return;
        onChange(draft);
        setOpen(false);
      }}>
        <DialogHeader>
          <DialogTitle>Selecionar período</DialogTitle>
          <DialogDescription>Defina as datas de início e fim para filtrar os lançamentos.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid min-w-0 gap-2 text-sm">Data de início
            <input required type="date" lang="pt-BR" value={draft.from} max={draft.to || undefined} onChange={event => setDraft(current => ({ ...current, from: event.target.value }))} className="min-h-11 min-w-0 w-full rounded-lg border border-input bg-background px-3 text-base focus-visible:outline-2 focus-visible:outline-ring" />
          </label>
          <label className="grid min-w-0 gap-2 text-sm">Data de fim
            <input required type="date" lang="pt-BR" value={draft.to} min={draft.from || undefined} onChange={event => setDraft(current => ({ ...current, to: event.target.value }))} className="min-h-11 min-w-0 w-full rounded-lg border border-input bg-background px-3 text-base focus-visible:outline-2 focus-visible:outline-ring" />
          </label>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button type="submit" disabled={!draft.from || !draft.to || draft.from > draft.to}>Aplicar período</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

function shortDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year?.slice(-2)}`;
}
