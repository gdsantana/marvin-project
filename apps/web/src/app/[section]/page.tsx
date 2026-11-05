import { notFound } from "next/navigation";
import { Workspace } from "@/components/workspace";

const sections = ["settings", "new", "accounts", "cards", "entries", "statements", "reports"] as const;

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!(sections as readonly string[]).includes(section)) notFound();
  return <Workspace section={section as typeof sections[number]} />;
}
