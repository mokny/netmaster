"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users, Trash2 } from "lucide-react";
import type { NasShareDTO, NasUserDTO } from "@/lib/types";

export function NasShareMembersDialog({
  share,
  nasUsers,
  onSaved,
}: {
  share: NasShareDTO;
  nasUsers: NasUserDTO[];
  onSaved: () => void;
}) {
  const t = useTranslations("admin.nasShareMembers");
  const tErrors = useTranslations("errors");
  const [open, setOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [role, setRole] = useState<"READ_ONLY" | "READ_WRITE">("READ_WRITE");

  const availableUsers = nasUsers.filter(
    (u) => !share.members.some((m) => m.nasUserId === u.id)
  );

  async function addMember() {
    if (!selectedUserId) return;
    const res = await fetch(`/api/admin/nas/shares/${share.id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nasUserId: selectedUserId, role }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(tErrors(data.error ?? "INTERNAL_ERROR"));
      return;
    }
    setSelectedUserId("");
    onSaved();
  }

  async function removeMember(nasUserId: string) {
    const res = await fetch(
      `/api/admin/nas/shares/${share.id}/members?nasUserId=${nasUserId}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      const data = await res.json();
      toast.error(tErrors(data.error ?? "INTERNAL_ERROR"));
      return;
    }
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon" className="size-7">
            <Users className="size-3.5" />
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title", { share: share.name })}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            {share.members.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("noMembers")}</p>
            )}
            {share.members.map((m) => (
              <div
                key={m.nasUserId}
                className="flex items-center justify-between rounded-md border p-2"
              >
                <div>
                  <div className="text-sm font-medium">{m.nasUser.name}</div>
                  <div className="text-xs text-muted-foreground">{m.nasUser.email}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{t(`role.${m.role}`)}</Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={() => removeMember(m.nasUserId)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
          {availableUsers.length > 0 && (
            <div className="flex items-end gap-2 border-t pt-3">
              <div className="flex-1 space-y-1">
                <Select value={selectedUserId} onValueChange={(v) => setSelectedUserId(v ?? "")}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t("addUserPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableUsers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name} ({u.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="READ_WRITE">{t("role.READ_WRITE")}</SelectItem>
                  <SelectItem value="READ_ONLY">{t("role.READ_ONLY")}</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" disabled={!selectedUserId} onClick={addMember}>
                {t("add")}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
