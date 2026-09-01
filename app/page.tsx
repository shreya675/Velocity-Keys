"use client";

import { useEffect, useState } from "react";
import ClientApp from "./client-app";

function LoadingShell() {
  return (
    <main className="min-h-screen px-5 py-8 text-ink">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center">
        <div className="rounded-lg border border-line bg-panel/90 p-5 shadow-soft backdrop-blur-xl">
          <div className="text-sm font-black uppercase text-muted">Loading Velocity Keys</div>
        </div>
      </section>
    </main>
  );
}

export default function Page() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return <LoadingShell />;
  return <ClientApp />;
}
