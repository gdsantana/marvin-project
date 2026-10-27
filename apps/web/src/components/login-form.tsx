"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, CircleAlertIcon, LockKeyholeIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        setError("Não foi possível entrar. Verifique sua senha e tente novamente.");
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("Não foi possível conectar. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 flex size-11 items-center justify-center rounded-xl border border-border bg-card text-primary">
        <LockKeyholeIcon className="size-5" aria-hidden="true" />
      </div>
      <p className="mb-3 font-mono text-xs text-primary">Acesso pessoal</p>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Bem-vindo de volta</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">Entre com sua senha para acessar seu espaço financeiro.</p>
      <form onSubmit={submit} className="mt-8" aria-busy={busy}>
        <FieldGroup>
          <Field data-disabled={busy}>
            <FieldLabel htmlFor="password">Senha</FieldLabel>
            <Input
              id="password"
              name="password"
              autoComplete="current-password"
              autoFocus
              type="password"
              required
              disabled={busy}
              value={password}
              onChange={event => setPassword(event.target.value)}
            />
          </Field>
          {error && (
            <Alert variant="destructive">
              <CircleAlertIcon aria-hidden="true" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Field>
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Verificando…" : "Entrar"}
              {!busy && <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />}
            </Button>
            <span role="status" className="sr-only">{busy ? "Verificando acesso" : ""}</span>
          </Field>
        </FieldGroup>
      </form>
    </div>
  );
}
