import { LoginForm } from "@/components/login-form";
import { Brand } from "@/components/app-shell";

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-col bg-background text-foreground md:grid md:grid-cols-2">
      <section className="flex flex-col gap-12 px-6 pt-8 sm:px-10 md:justify-between md:border-r md:border-border md:bg-card md:p-12 lg:p-16" aria-label="Marvin">
        <div className="flex items-center gap-3 text-lg font-semibold tracking-tight">
          <Brand />
          marvin
        </div>
        <div className="hidden max-w-lg flex-col gap-6 md:flex">
          <p className="font-mono text-xs text-primary">Finanças pessoais, com clareza</p>
          <h2 className="text-4xl font-semibold leading-tight tracking-tight lg:text-5xl">Veja o que entra.<br />Entenda o que fica.</h2>
          <p className="max-w-sm text-base leading-7 text-muted-foreground">Contas, cartões e escolhas do dia a dia em um só lugar.</p>
        </div>
        <p className="hidden font-mono text-xs text-muted-foreground md:block">Seu dinheiro, com clareza.</p>
      </section>
      <section className="flex flex-1 items-center justify-center px-6 py-12 sm:px-10 md:py-16" aria-label="Entrar no Marvin">
        <LoginForm />
      </section>
    </main>
  );
}
