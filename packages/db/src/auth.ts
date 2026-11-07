import { createHash, randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Database } from "./client.js";
import { hashPassword, verifyPassword } from "./password.js";
import { OwnerProvisionError } from "./provision-config.js";

export const SESSION_MAX_AGE = 60 * 60 * 24 * 7;
const digest = (token: string) => createHash("sha256").update(token).digest("hex");
const dummyHash = `scrypt$32768$8$3$${"0".repeat(32)}$${"0".repeat(128)}`;
export type AuthSession = { userId: string; username: string; csrfToken: string; expiresAt: number };

export function createAuthRepository(db: Database) {
  return {
    async login(username: string, password: string) {
      // A single fixed bucket bounds storage and expensive hashes, including unknown usernames.
      const attempt = await db.execute(sql`
        INSERT INTO auth_login_attempts (key, count, reset_at) VALUES ('owner', 1, now() + interval '15 minutes')
        ON CONFLICT (key) DO UPDATE SET
          count = CASE WHEN auth_login_attempts.reset_at <= now() THEN 1 ELSE auth_login_attempts.count + 1 END,
          reset_at = CASE WHEN auth_login_attempts.reset_at <= now() THEN now() + interval '15 minutes' ELSE auth_login_attempts.reset_at END
        WHERE auth_login_attempts.reset_at <= now() OR auth_login_attempts.count < 5
        RETURNING key`);
      if (!attempt.rowCount) return { status: "rate_limited" as const };
      const users = await db.execute<{ id: string; password_hash: string; is_active: boolean }>(sql`SELECT id, password_hash, is_active FROM auth_users WHERE username = ${username}`);
      const user = users.rows[0];
      const valid = await verifyPassword(password, user?.password_hash ?? dummyHash);
      if (!valid || !user?.is_active) return { status: "invalid" as const };
      const token = randomBytes(32).toString("base64url");
      const csrfToken = randomBytes(32).toString("base64url");
      const created = await db.transaction(async tx => {
        // Lock the owner while issuing a session so a concurrent password reset revokes it too.
        const current = await tx.execute(sql`SELECT id FROM auth_users WHERE id = ${user.id} AND password_hash = ${user.password_hash} AND is_active = true FOR UPDATE`);
        if (!current.rowCount) return false;
        await tx.execute(sql`DELETE FROM auth_sessions WHERE expires_at <= now()`);
        await tx.execute(sql`INSERT INTO auth_sessions (token_hash, user_id, csrf_token, expires_at) VALUES (${digest(token)}, ${user.id}, ${csrfToken}, now() + interval '7 days')`);
        await tx.execute(sql`DELETE FROM auth_login_attempts WHERE key = 'owner'`);
        return true;
      });
      return created ? { status: "authenticated" as const, token, csrfToken } : { status: "invalid" as const };
    },
    async readSession(token: string | undefined): Promise<AuthSession | null> {
      if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
      const result = await db.execute<{ user_id: string; username: string; csrf_token: string; expires_at: Date }>(sql`
        SELECT s.user_id, u.username, s.csrf_token, s.expires_at FROM auth_sessions s
        JOIN auth_users u ON u.id = s.user_id
        WHERE s.token_hash = ${digest(token)} AND s.expires_at > now() AND u.is_active = true`);
      const row = result.rows[0];
      return row ? { userId: row.user_id, username: row.username, csrfToken: row.csrf_token, expiresAt: new Date(row.expires_at).getTime() } : null;
    },
    async revokeSession(token: string) {
      await db.execute(sql`DELETE FROM auth_sessions WHERE token_hash = ${digest(token)}`);
    },
  };
}

export async function provisionOwner(db: Database, username: string, password: string, resetPassword = false) {
  if (!/^[a-z0-9][a-z0-9_.-]{2,63}$/.test(username) || password.length < 12 || password.length > 1024) throw new OwnerProvisionError("Use usuário com 3 a 64 caracteres, letras minúsculas, números, ponto, sublinhado ou hífen, começando por letra ou número; senha de 12 a 1024 caracteres.");
  const hash = await hashPassword(password);
  await db.transaction(async tx => {
    await tx.execute(sql`LOCK TABLE auth_users IN SHARE ROW EXCLUSIVE MODE`);
    const existing = await tx.execute<{ id: string; username: string }>(sql`SELECT id, username FROM auth_users`);
    const owner = existing.rows[0];
    if (owner) {
      if (!resetPassword || owner.username !== username) throw new OwnerProvisionError("Conta proprietária já existe. Para redefinir sua senha use --reset-password com o mesmo usuário.");
      await tx.execute(sql`UPDATE auth_users SET password_hash = ${hash}, is_active = true WHERE id = ${owner.id}`);
      await tx.execute(sql`DELETE FROM auth_sessions WHERE user_id = ${owner.id}`);
    } else {
      if (resetPassword) throw new OwnerProvisionError("Conta proprietária inexistente.");
      await tx.execute(sql`INSERT INTO auth_users (username, password_hash) VALUES (${username}, ${hash})`);
    }
    await tx.execute(sql`DELETE FROM auth_login_attempts WHERE key = 'owner'`);
  });
}
