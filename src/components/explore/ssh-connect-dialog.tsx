"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useTerminalManager } from "@/hooks/use-terminal-manager";

interface Props {
  host: string;
  port: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Fragt einmalig SSH-Zugangsdaten für einen Explore-Host ab, der (noch)
// nicht als Server angelegt ist. Die Daten werden nicht gespeichert - sie
// gehen als kurzlebiges Ticket an den internen SSH-Client (siehe
// adhoc-ssh-tickets.ts) und öffnen direkt einen Terminal-Tab.
export function SshConnectDialog({ host, port, open, onOpenChange }: Props) {
  const { openAdhocTerminal } = useTerminalManager();
  const [sshPort, setSshPort] = useState(port);
  const [username, setUsername] = useState("root");
  const [authType, setAuthType] = useState<"PASSWORD" | "PRIVATE_KEY">("PASSWORD");
  const [secret, setSecret] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [connecting, setConnecting] = useState(false);

  async function connect() {
    setConnecting(true);
    try {
      const res = await fetch("/api/explore/ssh-ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host,
          port: sshPort,
          username,
          authType,
          secret,
          passphrase: authType === "PRIVATE_KEY" ? passphrase || undefined : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Ticket konnte nicht erstellt werden");
        return;
      }
      openAdhocTerminal(data.ticket, `${username}@${host}`);
      onOpenChange(false);
      setSecret("");
      setPassphrase("");
    } finally {
      setConnecting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Per SSH verbinden</DialogTitle>
          <DialogDescription>
            Zugangsdaten für {host} werden nur einmalig für diese Verbindung verwendet, nicht
            gespeichert.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void connect();
          }}
        >
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div className="space-y-2">
              <Label>Benutzername</Label>
              <Input required value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Port</Label>
              <Input
                type="number"
                className="w-20"
                value={sshPort}
                onChange={(e) => setSshPort(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Authentifizierung</Label>
            <Select value={authType} onValueChange={(v) => setAuthType(v as typeof authType)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PASSWORD">Passwort</SelectItem>
                <SelectItem value="PRIVATE_KEY">Privater Schlüssel</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{authType === "PASSWORD" ? "Passwort" : "Privater Schlüssel (PEM)"}</Label>
            {authType === "PASSWORD" ? (
              <Input
                type="password"
                required
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
              />
            ) : (
              <textarea
                className="min-h-32 w-full rounded-md border bg-transparent p-2 font-mono text-xs shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                required
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
              />
            )}
          </div>
          {authType === "PRIVATE_KEY" && (
            <div className="space-y-2">
              <Label>
                Passphrase
                <span className="ml-1 font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
              />
            </div>
          )}
          <DialogFooter>
            <Button type="submit" disabled={connecting}>
              {connecting && <Loader2 className="size-4 animate-spin" />}
              Verbinden
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
