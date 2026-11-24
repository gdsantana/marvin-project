"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Workspace } from "./workspace";
import { workspaceRoute } from "./workspace-route-data";

export function WorkspaceRoute({ children }: { children: ReactNode }) {
  const route = workspaceRoute(usePathname());
  // The shared layout keeps session, SSE and loaded data alive across routes.
  return route ? <Workspace section={route.section} accountId={route.accountId} /> : children;
}
