"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { UserFormDialog } from "@/components/admin/user-form-dialog";
import { useSession } from "@/hooks/use-session";
import { Pencil, Trash2 } from "lucide-react";
import type { UserDTO } from "@/lib/types";

export default function UsersPage() {
  const session = useSession();
  const [users, setUsers] = useState<UserDTO[] | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/users");
    if (res.ok) setUsers((await res.json()).users);
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/users")
      .then((res) => (res.ok ? res.json() : { users: [] }))
      .then((data) => {
        if (active) setUsers(data.users);
      });
    return () => {
      active = false;
    };
  }, []);

  async function deleteUser(id: string) {
    if (!confirm("Diesen Nutzer wirklich löschen?")) return;
    const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Nutzer gelöscht");
      load();
    } else {
      const data = await res.json();
      toast.error(data.error ?? "Löschen fehlgeschlagen");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Nutzer</h1>
          <p className="text-sm text-muted-foreground">
            Accounts und Rollen verwalten. Nur Admins können Nutzer anlegen.
          </p>
        </div>
        <UserFormDialog onSaved={load} />
      </div>

      {users === null ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>E-Mail</TableHead>
                <TableHead>Rolle</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{u.role}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <UserFormDialog
                        user={u}
                        onSaved={load}
                        trigger={
                          <Button variant="ghost" size="icon" className="size-7">
                            <Pencil className="size-3.5" />
                          </Button>
                        }
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        disabled={u.id === session?.userId}
                        onClick={() => deleteUser(u.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
