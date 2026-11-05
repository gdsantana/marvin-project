"use client";

import { createContext, useContext, useId, useRef, useState, type FormEvent } from "react";
import type { CreateCategoryInput } from "@finance/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { categoryPath } from "./category-path";
import type { CategoryOption } from "./workspace-types";

export const CategoryCreationContext = createContext<((input: CreateCategoryInput, key: string) => Promise<CategoryOption>) | null>(null);

export function CategoryPicker({ categories, type, name = "categoryId", label = "Categoria", defaultValue = "", disabled = false }: {
  categories: CategoryOption[]; type: "income" | "expense"; name?: string; label?: string; defaultValue?: string; disabled?: boolean;
}) {
  const createCategory = useContext(CategoryCreationContext);
  const id = useId();
  const selectRef = useRef<HTMLSelectElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const request = useRef<{ signature: string; key: string } | null>(null);
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const available = categories.filter(category => !category.isArchived && category.type === type);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!createCategory || inFlight.current) return;
    const data = new FormData(event.currentTarget);
    const input = { name: String(data.get("newCategoryName") ?? "").trim(), type, parentId: String(data.get("newCategoryParent") ?? "") || null };
    if (!input.name) { setError("Informe o nome da categoria."); nameRef.current?.focus(); return; }
    const existing = available.find(category => category.name.trim().toLocaleLowerCase("pt-BR") === input.name.toLocaleLowerCase("pt-BR") && (category.parentId ?? null) === input.parentId);
    if (existing) { setValue(existing.id); setOpen(false); return; }
    const signature = JSON.stringify(input);
    if (request.current?.signature !== signature) request.current = { signature, key: crypto.randomUUID() };
    inFlight.current = true; setBusy(true); setError("");
    try {
      const category = await createCategory(input, request.current.key);
      setValue(category.id); request.current = null; setOpen(false);
    } catch { setError("Não foi possível criar a categoria. Tente novamente."); }
    finally { inFlight.current = false; setBusy(false); }
  }

  return <FieldGroup className="gap-2">
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <NativeSelect ref={selectRef} id={id} name={name} value={value} disabled={disabled} onChange={event => setValue(event.target.value)} className="w-full">
        <option value="">Sem categoria</option>
        {available.map(category => <option key={category.id} value={category.id}>{categoryPath(category, categories)}</option>)}
      </NativeSelect>
    </Field>
    {createCategory && <Dialog open={open} onOpenChange={next => { if (!inFlight.current) { setOpen(next); if (next) setError(""); } }}>
      <Button type="button" variant="ghost" disabled={disabled} className="min-h-11 self-start" onClick={() => { setError(""); setOpen(true); }}>Criar categoria</Button>
      <DialogContent showCloseButton={false} initialFocus={nameRef} finalFocus={selectRef}>
        <DialogHeader><DialogTitle>Criar categoria</DialogTitle><DialogDescription>A categoria será salva mesmo se você cancelar a transação. Selecione uma categoria superior para criar uma subcategoria.</DialogDescription></DialogHeader>
        <form onSubmit={save} onChange={event => event.stopPropagation()} aria-busy={busy}>
          <FieldGroup>
            <Field><FieldLabel htmlFor={`${id}-name`}>Nome da categoria</FieldLabel><Input ref={nameRef} id={`${id}-name`} name="newCategoryName" required disabled={busy} /></Field>
            <Field><FieldLabel htmlFor={`${id}-parent`}>Categoria superior</FieldLabel><NativeSelect id={`${id}-parent`} name="newCategoryParent" disabled={busy} className="w-full"><option value="">Sem categoria superior</option>{available.map(category => <option key={category.id} value={category.id}>{categoryPath(category, categories)}</option>)}</NativeSelect></Field>
            <p className="text-xs text-muted-foreground">Tipo: {type === "income" ? "Receita" : "Despesa"}</p>
            {error && <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}
            <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" disabled={busy}>{busy ? "Criando…" : "Criar e selecionar"}</Button></div>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>}
  </FieldGroup>;
}
