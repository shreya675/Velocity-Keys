import { Suspense } from "react";
import ClientApp from "../client-app";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<div className="min-h-screen bg-panel p-8 text-muted" role="status">Loading Velocity Keys…</div>}>
    <ClientApp />
    {children}
  </Suspense>;
}
