"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KeyRound, Trash2, Pencil, Check } from "lucide-react";
import type { PasskeyDTO } from "@/lib/types";

export function PasskeyList({
  passkeys,
  onRename,
  onRemove,
}: {
  passkeys: PasskeyDTO[];
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  if (passkeys.length === 0) {
    return <p className="text-sm text-muted-foreground">Keine Passkeys hinterlegt.</p>;
  }

  return (
    <ul className="divide-y rounded-md border">
      {passkeys.map((p) => (
        <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
          <KeyRound className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            {editingId === p.id ? (
              <div className="flex items-center gap-2">
                <Input
                  autoFocus
                  className="h-7"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      onRename(p.id, editValue);
                      setEditingId(null);
                    }
                  }}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0"
                  onClick={() => {
                    onRename(p.id, editValue);
                    setEditingId(null);
                  }}
                >
                  <Check className="size-3.5" />
                </Button>
              </div>
            ) : (
              <p className="truncate text-sm font-medium">{p.name}</p>
            )}
            <p className="truncate text-xs text-muted-foreground">
              Angelegt {new Date(p.createdAt).toLocaleDateString()}
              {p.lastUsedAt && ` · Zuletzt genutzt ${new Date(p.lastUsedAt).toLocaleDateString()}`}
            </p>
          </div>
          {editingId !== p.id && (
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              aria-label="Umbenennen"
              onClick={() => {
                setEditingId(p.id);
                setEditValue(p.name);
              }}
            >
              <Pencil className="size-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            aria-label="Passkey entfernen"
            onClick={() => onRemove(p.id)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </li>
      ))}
    </ul>
  );
}
