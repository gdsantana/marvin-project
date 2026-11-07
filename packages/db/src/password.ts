import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

const options = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => scryptCallback(password, salt, 64, options, (error, key) => error ? reject(error) : resolve(key)));
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$32768$8$3$${salt}$${(await derive(password, salt)).toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [algorithm, n, r, p, salt, hex, extra] = stored.split("$");
  if (algorithm !== "scrypt" || n !== "32768" || r !== "8" || p !== "3" || !/^[a-f0-9]{32}$/.test(salt ?? "") || !/^[a-f0-9]{128}$/.test(hex ?? "") || extra !== undefined) return false;
  return timingSafeEqual(await derive(password, salt!), Buffer.from(hex!, "hex"));
}
