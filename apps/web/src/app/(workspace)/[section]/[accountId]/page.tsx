import { notFound } from "next/navigation";
import { z } from "zod";

export default async function AccountPage({ params }: { params: Promise<{ section: string; accountId: string }> }) {
  const { section, accountId } = await params;
  if (section !== "accounts" || !z.uuid().safeParse(accountId).success) notFound();
  return null;
}
