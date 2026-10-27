import { timingSafeEqual } from "node:crypto";

export function bearerTokenIsValid(header: string | undefined, configuredToken: string | undefined) {
  const supplied = header?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!configuredToken || !supplied) return false;
  const expectedBytes = Buffer.from(configuredToken);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}
