"use client";

import { useEffect, useState } from "react";
import type { SessionPayload } from "@/lib/auth";

export function useSession(): SessionPayload | null {
  const [session, setSession] = useState<SessionPayload | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : { user: null }))
      .then((data) => setSession(data.user))
      .catch(() => setSession(null));
  }, []);

  return session;
}
