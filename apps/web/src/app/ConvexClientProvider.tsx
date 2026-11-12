"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";

const deploymentUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convexClient = deploymentUrl
  ? new ConvexReactClient(deploymentUrl)
  : null;

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  if (convexClient === null) {
    return children;
  }

  return <ConvexProvider client={convexClient}>{children}</ConvexProvider>;
}
