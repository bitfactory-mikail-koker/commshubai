"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { setRolePermission } from "@/actions/team";
import { useAction } from "@/components/shared/actions";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PERMISSION_KEYS, PERMISSION_LABELS, type PermissionKey } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export type MatrixRole = { id: string; key: string; label: string; permissions: PermissionKey[] };

const CONTENT = PERMISSION_KEYS.filter((k) => k.startsWith("content."));
const ADMIN = PERMISSION_KEYS.filter((k) => !k.startsWith("content."));

export function PermissionMatrix({ roles, canManage }: { roles: MatrixRole[]; canManage: boolean }) {
  const { run, pending } = useAction();
  // Optimistic overrides keyed by "roleId:permission"; cleared again on failure.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const isChecked = (role: MatrixRole, permission: PermissionKey) =>
    overrides[`${role.id}:${permission}`] ?? role.permissions.includes(permission);

  const toggle = (role: MatrixRole, permission: PermissionKey, enabled: boolean) => {
    const key = `${role.id}:${permission}`;
    setOverrides((o) => ({ ...o, [key]: enabled }));
    setSavingKey(key);
    const clear = () => {
      setSavingKey(null);
      setOverrides((o) => {
        const next = { ...o };
        delete next[key];
        return next;
      });
    };
    run(() => setRolePermission({ roleId: role.id, permission, enabled }), {
      silent: true,
      // On success the override already equals the refreshed server value, so it stays.
      onSuccess: () => setSavingKey(null),
      onError: clear,
    });
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] border-collapse text-sm">
        <thead>
          <tr className="border-b">
            <th rowSpan={2} scope="col" className="w-44 px-5 py-3 text-left align-bottom text-xs font-medium text-muted-foreground">
              Rol
            </th>
            <th
              colSpan={CONTENT.length}
              scope="colgroup"
              className="border-l px-3 pt-3 pb-1 text-left text-[0.68rem] font-semibold text-muted-foreground "
            >
              Content
            </th>
            <th
              colSpan={ADMIN.length}
              scope="colgroup"
              className="border-l px-3 pt-3 pb-1 text-left text-[0.68rem] font-semibold text-muted-foreground "
            >
              Beheer
            </th>
          </tr>
          <tr className="border-b">
            {[...CONTENT, ...ADMIN].map((permission, index) => (
              <th
                key={permission}
                scope="col"
                className={cn(
                  "px-2 pt-1 pb-3 text-center align-bottom text-xs font-medium",
                  (index === 0 || index === CONTENT.length) && "border-l",
                )}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help leading-tight decoration-dotted underline-offset-4 hover:underline">
                      {PERMISSION_LABELS[permission].label.replace(/^Content /, "").replace(/ beheren$/, "")}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-56 text-center">{PERMISSION_LABELS[permission].description}</TooltipContent>
                </Tooltip>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {roles.map((role) => {
            const locked = role.key === "administrator";
            return (
              <tr key={role.id} className="border-b last:border-b-0 hover:bg-muted/30">
                <th scope="row" className="px-5 py-3 text-left font-medium">
                  <span className="flex items-center gap-1.5">
                    {role.label}
                    {locked && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Lock className="size-3 text-muted-foreground" aria-label="Rechten liggen vast" />
                        </TooltipTrigger>
                        <TooltipContent>De beheerder heeft altijd alle rechten.</TooltipContent>
                      </Tooltip>
                    )}
                  </span>
                </th>
                {[...CONTENT, ...ADMIN].map((permission, index) => {
                  const key = `${role.id}:${permission}`;
                  const checked = isChecked(role, permission);
                  return (
                    <td
                      key={permission}
                      className={cn("px-2 py-3 text-center", (index === 0 || index === CONTENT.length) && "border-l")}
                    >
                      <Checkbox
                        checked={checked}
                        disabled={!canManage || locked || pending}
                        aria-label={`${PERMISSION_LABELS[permission].label} voor ${role.label}`}
                        className={cn("mx-auto", savingKey === key && "animate-pulse")}
                        onCheckedChange={(value) => toggle(role, permission, value === true)}
                      />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
