import { NextResponse } from "next/server";

// Dynamische Manifest-Route für den Web-Dateimanager (#9): eine eigene
// Installations-Identität getrennt vom Admin-Panel (public/manifest.webmanifest),
// mit einem Namen, der (best effort) die aktuell geöffnete Freigabe
// widerspiegelt. Da die Ordner-/Freigaben-Navigation im Explorer rein
// client-seitig ist (die URL bleibt immer /filebrowser/[serverId], siehe
// explorer.tsx setCurrentPath), kann ein statisch gerenderter
// Manifest-Datei das nicht wissen - stattdessen zeigt explorer.tsx den
// <link rel="manifest">-Tag live auf DIESE Route mit dem aktuellen
// Freigabenamen als `?share=`-Query-Parameter um.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await params;
  const url = new URL(req.url);
  const share = url.searchParams.get("share")?.trim();
  const name = share ? `${share} NAS` : "NAS";

  const manifest = {
    name,
    short_name: name,
    description: "Samba-Dateimanager",
    start_url: `/filebrowser/${serverId}`,
    scope: `/filebrowser/${serverId}`,
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/filebrowser-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/filebrowser-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/filebrowser-icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };

  return NextResponse.json(manifest, {
    headers: { "Content-Type": "application/manifest+json" },
  });
}
