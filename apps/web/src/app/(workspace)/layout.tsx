import { WorkspaceRoute } from "@/components/workspace-route";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <WorkspaceRoute>{children}</WorkspaceRoute>;
}
