"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import type { AppRole } from "@/lib/auth/roles";
import {
  ALL_ROLES,
  ROLE_LABELS,
  assignableRoles,
} from "@/lib/team/manage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  changeMemberRoleAction,
  inviteMemberAction,
  removeMemberAction,
  revokeInviteAction,
} from "../actions";

export interface TeamMember {
  userId: string;
  name: string | null;
  email: string;
  role: AppRole;
}

export interface PendingInvite {
  id: string;
  email: string;
  role: AppRole;
}

const ROLE_VARIANT: Record<AppRole, "default" | "secondary" | "outline"> = {
  owner: "default",
  admin: "secondary",
  operator: "outline",
  viewer: "outline",
};

function RoleBadge({ role }: { role: AppRole }) {
  return <Badge variant={ROLE_VARIANT[role]}>{ROLE_LABELS[role]}</Badge>;
}

function initials(name: string): string {
  return name
    .split(/[\s@.]+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function TeamClient({
  members,
  invites,
  canManage,
  callerRole,
  currentUserId,
}: {
  members: TeamMember[];
  invites: PendingInvite[];
  canManage: boolean;
  callerRole: AppRole | null;
  currentUserId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [removing, setRemoving] = React.useState<TeamMember | null>(null);

  const inviteRoles = assignableRoles(callerRole);
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState<AppRole>(
    inviteRoles[0] ?? "operator"
  );

  /** Can the caller act on this member's role/membership? */
  const canManageMember = (m: TeamMember): boolean => {
    if (!canManage) return false;
    if (callerRole === "owner") return true;
    // admin: only operators/viewers
    return m.role === "operator" || m.role === "viewer";
  };

  function run(fn: () => Promise<{ ok: boolean; message?: string }>, ok: string) {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        toast.success(ok);
        router.refresh();
      } else {
        toast.error(res.message ?? "Action refusée.");
      }
    });
  }

  function onInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    run(
      () => inviteMemberAction({ email: inviteEmail, role: inviteRole }),
      "Invitation envoyée."
    );
    setInviteEmail("");
  }

  return (
    <div className="flex flex-col gap-6">
      {canManage && inviteRoles.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Inviter un membre</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onInvite} className="flex flex-wrap items-end gap-3">
              <div className="grid min-w-56 flex-1 gap-2">
                <Input
                  type="email"
                  placeholder="adresse@exemple.com"
                  value={inviteEmail}
                  disabled={pending}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                />
              </div>
              <Select
                value={inviteRole}
                disabled={pending}
                onValueChange={(v) => setInviteRole(v as AppRole)}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {inviteRoles.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="submit" disabled={pending}>
                {pending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <UserPlus className="size-4" />
                )}
                Inviter
              </Button>
            </form>
            <p className="text-muted-foreground mt-2 text-xs">
              Clerk envoie l&apos;e-mail d&apos;invitation. Le rôle est appliqué à
              l&apos;acceptation.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Membres ({members.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col divide-y">
          {members.map((m) => {
            const manageable = canManageMember(m);
            const roleOptions = Array.from(
              new Set([...assignableRoles(callerRole), m.role])
            ).sort((a, b) => ALL_ROLES.indexOf(a) - ALL_ROLES.indexOf(b));
            return (
              <div key={m.userId} className="flex items-center gap-3 py-3">
                <span className="bg-accent text-accent-foreground flex size-9 shrink-0 items-center justify-center rounded-full font-mono text-xs font-semibold">
                  {initials(m.name || m.email)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {m.name || m.email}
                    {m.userId === currentUserId ? (
                      <span className="text-muted-foreground font-normal"> (vous)</span>
                    ) : null}
                  </p>
                  {m.name ? (
                    <p className="text-muted-foreground truncate text-xs">{m.email}</p>
                  ) : null}
                </div>

                {manageable ? (
                  <Select
                    value={m.role}
                    disabled={pending}
                    onValueChange={(v) =>
                      run(
                        () =>
                          changeMemberRoleAction({
                            targetUserId: m.userId,
                            role: v as AppRole,
                          }),
                        "Rôle mis à jour."
                      )
                    }
                  >
                    <SelectTrigger className="w-36" size="sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {roleOptions.map((r) => (
                        <SelectItem key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <RoleBadge role={m.role} />
                )}

                {manageable ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={pending}
                    aria-label="Retirer"
                    onClick={() => setRemoving(m)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                ) : (
                  <span className="size-9" />
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {invites.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Invitations en attente ({invites.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y">
            {invites.map((inv) => (
              <div key={inv.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{inv.email}</p>
                </div>
                <RoleBadge role={inv.role} />
                <Badge variant="outline" className="text-amber">
                  Invité
                </Badge>
                {canManage ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      run(
                        () => revokeInviteAction({ invitationId: inv.id }),
                        "Invitation révoquée."
                      )
                    }
                  >
                    Révoquer
                  </Button>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Retirer le membre</DialogTitle>
            <DialogDescription>
              {removing
                ? `Retirer ${removing.name || removing.email} de l'organisation ? Son accès sera révoqué.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Annuler
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={() => {
                const m = removing;
                if (!m) return;
                setRemoving(null);
                run(
                  () => removeMemberAction({ targetUserId: m.userId }),
                  "Membre retiré."
                );
              }}
            >
              Retirer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
