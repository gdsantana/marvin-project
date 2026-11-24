import { notFound } from "next/navigation";

const sections = ["settings", "new", "accounts", "cards", "entries", "statements", "reports"] as const;

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!(sections as readonly string[]).includes(section)) notFound();
  return null;
}
