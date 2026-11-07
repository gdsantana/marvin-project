import { LoginForm } from "@/components/login-form";
import { Brand } from "@/components/app-shell";

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-col bg-background text-foreground lg:grid lg:grid-cols-2">
      <section className="flex flex-col gap-12 px-6 pt-8 sm:px-10 lg:justify-between lg:border-r lg:border-border lg:bg-card lg:p-12 xl:p-16" aria-label="Marvin">
        <div className="flex items-center gap-3 text-lg font-semibold tracking-tight">
          <Brand />
          Marvin Finanças
        </div>
        <div className="hidden max-w-lg flex-col gap-6 lg:flex">
          <p className="text-sm text-primary">Finanças pessoais, com clareza</p>
          <h2 className="text-balance text-4xl font-semibold leading-tight tracking-tight xl:text-5xl">Veja o que entra.<br />Entenda o que fica.</h2>
          <p className="max-w-sm text-base leading-7 text-muted-foreground">Contas, cartões e escolhas do dia a dia em um só lugar.</p>
        </div>
        <p className="hidden text-xs text-muted-foreground lg:block">Seu dinheiro, com clareza.</p>
      </section>
      <section className="flex flex-1 items-start justify-center px-6 pb-10 pt-14 sm:items-center sm:px-10 sm:py-16" aria-label="Entrar no Marvin">
        <LoginForm />
      </section>
    </main>
  );
}
