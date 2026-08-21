"use client";

import { useEffect, useRef, useState } from "react";
import type { TerminalSession } from "@/hooks/use-terminal-manager";
import { useTranslations } from "next-intl";

function randomTicket(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function VncTab({ session }: { session: TerminalSession }) {
  const t = useTranslations("terminal.vncTab");
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"connecting" | "connected" | "error" | "closed">(
    "connecting"
  );

  useEffect(() => {
    if (!containerRef.current) return;
    let disposed = false;
    let rfb: import("@novnc/novnc").default | null = null;

    import("@novnc/novnc").then(({ default: RFB }) => {
      if (disposed || !containerRef.current) return;
      const ticket = randomTicket();
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      const url = `${protocol}://${window.location.host}/api/ws/vm-vnc?serverId=${encodeURIComponent(session.serverId)}&vmid=${session.vmid}&ticket=${ticket}`;

      rfb = new RFB(containerRef.current, url, { credentials: { password: ticket } });
      rfb.scaleViewport = true;
      rfb.clipViewport = false;
      rfb.addEventListener("connect", () => setStatus("connected"));
      rfb.addEventListener("disconnect", (e) => {
        const detail = (e as CustomEvent<{ clean: boolean }>).detail;
        setStatus(detail?.clean ? "closed" : "error");
      });
      rfb.addEventListener("securityfailure", () => setStatus("error"));
    });

    return () => {
      disposed = true;
      rfb?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-black">
      {status === "connecting" && (
        <div className="absolute inset-x-0 top-0 z-10 bg-muted/90 px-3 py-1 text-xs text-muted-foreground">
          {t("connecting")}
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-x-0 top-0 z-10 bg-red-950/90 px-3 py-1.5 text-xs text-red-200">
          {t("connectionFailed")}
        </div>
      )}
      {status === "closed" && (
        <div className="absolute inset-x-0 top-0 z-10 bg-muted/90 px-3 py-1 text-xs text-muted-foreground">
          {t("disconnected")}
        </div>
      )}
      <div ref={containerRef} className="h-full w-full min-h-0 min-w-0" />
    </div>
  );
}
