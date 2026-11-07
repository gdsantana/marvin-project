"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, CircleAlertIcon, EyeIcon, EyeOffIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
        body: JSON.stringify({ username, password }),
      });
      if (!response.ok) {
        setError(response.status === 429
          ? "Muitas tentativas. Aguarde 15 minutos e tente novamente."
          : response.status === 401 || response.status === 400
            ? "Usuário ou senha incorretos. Verifique os dados e tente novamente."
            : "Não foi possível entrar agora. Tente novamente em instantes.");
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
      <h1 className="text-balance text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">Bem-vindo de volta</h1>
      <p className="mt-3 text-pretty text-sm leading-6 text-muted-foreground">Entre com seu usuário e senha para acessar seu espaço financeiro.</p>
      <form onSubmit={submit} className="mt-8" aria-busy={busy}>
        <FieldGroup>
          <Field data-disabled={busy}>
            <FieldLabel htmlFor="username">Usuário</FieldLabel>
            <Input id="username" name="username" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} className="h-12 px-3" required maxLength={64} disabled={busy} value={username} onChange={event => setUsername(event.target.value)} />
          </Field>
          <Field data-disabled={busy}>
            <FieldLabel htmlFor="password">Senha</FieldLabel>
            <InputGroup className="h-12">
              <InputGroupInput
                id="password"
                name="password"
                autoComplete="current-password"
                type={showPassword ? "text" : "password"}
                required
                maxLength={1024}
                disabled={busy}
                value={password}
                onChange={event => setPassword(event.target.value)}
              />
              <InputGroupAddon align="inline-end" className="py-0 pr-0.5">
                <InputGroupButton
                  size="icon-sm"
                  className="size-11 touch-manipulation text-muted-foreground hover:text-foreground focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-inset"
                  disabled={busy}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  aria-controls="password"
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword(value => !value)}
                >
                  {showPassword ? <EyeOffIcon aria-hidden="true" /> : <EyeIcon aria-hidden="true" />}
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </Field>
          {error && (
            <Alert variant="destructive">
              <CircleAlertIcon aria-hidden="true" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Field>
            <Button type="submit" disabled={busy} className="h-12 w-full touch-manipulation">
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
