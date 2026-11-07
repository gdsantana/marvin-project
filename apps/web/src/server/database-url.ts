export function configureDevelopmentDatabase(env: { NODE_ENV?: string; DATABASE_URL?: string; DEVELOPMENT_DATABASE_URL?: string }) {
  if (env.NODE_ENV === "production" || !env.DEVELOPMENT_DATABASE_URL || !env.DATABASE_URL) return;
  try {
    // Preserve explicit connections, including disposable integration-test databases.
    if (new URL(env.DATABASE_URL).hostname === "db") env.DATABASE_URL = env.DEVELOPMENT_DATABASE_URL;
  } catch { /* Invalid configuration remains invalid; do not silently select another database. */ }
}
