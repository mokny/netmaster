// Eigene Route-Gruppe für den Samba-Web-Dateimanager: bewusst KEIN AppShell/
// Admin-Navigation, keine Admin-Session nötig (siehe proxy.ts-Ausnahme für
// /filebrowser und /api/filebrowser). Das umgebende html/body/Theme kommt
// weiterhin vom Root-Layout (src/app/layout.tsx), das ist geteilte
// Infrastruktur, keine Admin-Oberfläche.
export default function FilebrowserLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-background text-foreground">{children}</div>;
}
