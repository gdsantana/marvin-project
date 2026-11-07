export class OwnerProvisionError extends Error {}

export function ownerDatabaseUrl(env: NodeJS.ProcessEnv = process.env) {
  const value = env.NODE_ENV === "production" ? env.DATABASE_URL : env.DEVELOPMENT_DATABASE_URL ?? env.DATABASE_URL;
  if (!value) throw new OwnerProvisionError("Configure DATABASE_URL ou DEVELOPMENT_DATABASE_URL para o banco de desenvolvimento.");
  try {
    const url = new URL(value);
    if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error();
  } catch { throw new OwnerProvisionError("URL do PostgreSQL inválida. Confira a configuração sem compartilhar credenciais."); }
  return value;
}

export function ownerProvisionErrorMessage(error: unknown) {
  const messages: Record<string, string> = {
    ECONNREFUSED: "Conexão recusada. No host de desenvolvimento, execute pnpm db:up para publicar a porta e confira DEVELOPMENT_DATABASE_URL.",
    ENOTFOUND: "Host do PostgreSQL não encontrado. O host db só funciona dentro do Compose; no terminal local, configure DEVELOPMENT_DATABASE_URL com 127.0.0.1.",
    EAI_AGAIN: "Não foi possível resolver o host do PostgreSQL. O host db só funciona dentro do Compose; no terminal local, configure DEVELOPMENT_DATABASE_URL com 127.0.0.1.",
    "28P01": "Autenticação do PostgreSQL recusada. Confira as credenciais da conexão ao banco.",
    "28000": "Acesso ao PostgreSQL recusado. Confira as permissões de conexão.",
    "3D000": "Banco de dados inexistente. Confira o nome do banco configurado.",
    "42P01": "Tabelas de autenticação ausentes. Aplique pnpm db:migrate com DATABASE_URL apontando para o mesmo banco antes de criar a conta.",
    "42501": "Permissão insuficiente no PostgreSQL para configurar a conta proprietária.",
    "23505": "A conta proprietária já existe. Para redefinir a senha, use --reset-password com o mesmo usuário.",
  };
  let cause = error;
  for (let depth = 0; depth < 5 && cause instanceof Error; depth++) {
    if (cause instanceof OwnerProvisionError) return cause.message;
    const code = (cause as Error & { code?: string }).code;
    if (code && Object.hasOwn(messages, code)) return messages[code]!;
    cause = cause.cause;
  }
  return "Verifique a conexão, as permissões e as migrations do PostgreSQL. Nenhum detalhe privado do erro foi exibido.";
}
