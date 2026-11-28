import { z } from "zod";
import type { Section } from "./workspace-types";

const sections = new Set(["settings", "accounts", "cards", "entries", "statements", "reports"]);

export function workspaceRoute(pathname: string): { section: Section; accountId?: string; openNew?: boolean } | null {
  if (pathname === "/") return { section: "overview" };
  const parts = pathname.replace(/\/$/, "").split("/").slice(1);
  if (parts.length === 1 && parts[0] === "new") return { section: "entries", openNew: true };
  if (parts.length === 1 && sections.has(parts[0]!)) return { section: parts[0] as Section };
  if (parts.length === 2 && parts[0] === "accounts" && z.uuid().safeParse(parts[1]).success) return { section: "accounts", accountId: parts[1] };
  return null;
}
