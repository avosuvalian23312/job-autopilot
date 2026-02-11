// src/components/RequireAuth.jsx
import React, { useEffect, useState } from "react";
import { requireAuth } from "@/lib/auth";

// optional: show a loader while checking
export default function RequireAuth({ children, provider = "google" }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const profile = await requireAuth({ provider, retries: 1 });
      if (!cancelled && profile?.userId) setReady(true);
      // if not logged in -> requireAuth redirects away
    })();

    return () => {
      cancelled = true;
    };
  }, [provider]);

  if (!ready) {
    return (
      <div className="min-h-screen bg-[hsl(240,10%,4%)] flex items-center justify-center">
        <div className="text-white/70">Checking session…</div>
      </div>
    );
  }

  return children;
}
