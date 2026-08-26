import type { Metadata } from "next";

// Eigene Route-Gruppe für den Samba-Web-Dateimanager: bewusst KEIN AppShell/
// Admin-Navigation, keine Admin-Session nötig (siehe proxy.ts-Ausnahme für
// /filebrowser und /api/filebrowser). Das umgebende html/body/Theme kommt
// weiterhin vom Root-Layout (src/app/layout.tsx), das ist geteilte
// Infrastruktur, keine Admin-Oberfläche.

// #9: eigene PWA-Installations-Identität, getrennt von public/manifest.webmanifest
// (Admin-Panel). Dies ist die statische BASELINE (greift bereits im initialen
// HTML, bevor explorer.tsx's client-seitiger Freigaben-Tracking-Effekt
// überhaupt gelaufen ist) - der `manifest`-Wert zeigt auf die DYNAMISCHE
// Route (siehe api/filebrowser/[serverId]/manifest/route.ts), nicht auf eine
// statische Datei, damit explorer.tsx den <link>-Tag später live per
// `?share=`-Parameter umbiegen kann, ohne dass beim ersten Laden ("/" -
// Freigaben-Wurzel) etwas falsches/veraltetes im DOM steht.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ serverId: string }>;
}): Promise<Metadata> {
  const { serverId } = await params;
  return {
    title: "NAS",
    manifest: `/api/filebrowser/${serverId}/manifest`,
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: "NAS",
    },
    other: {
      "apple-mobile-web-app-title": "NAS",
    },
    icons: {
      icon: [
        { url: "/filebrowser-icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/filebrowser-icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      apple: [{ url: "/filebrowser-apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    },
  };
}

export default function FilebrowserLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-background text-foreground">{children}</div>;
}
