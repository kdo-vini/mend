import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  Clock3,
  MailPlus,
  MoreHorizontal,
  RefreshCw,
  Search,
  Trash2,
  UserRound,
  UserRoundCheck,
  UserRoundX,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCurrentUser } from "../../../api/auth";
import { LiveActionError } from "../../../api/transport";
import type { Confirm } from "../../../shared/ui/ConfirmDialog";
import {
  createLiveWorkspaceInvitation,
  listLiveWorkspaceInvitations,
  listLiveWorkspaceMembers,
  removeLiveWorkspaceMember,
  resendLiveWorkspaceInvitation,
  revokeLiveWorkspaceInvitation,
  updateLiveWorkspaceInvitationRole,
  updateLiveWorkspaceMemberRole,
  type LiveWorkspaceInvitation,
  type LiveWorkspaceMember,
} from "../api";

type WorkspaceRole = "owner" | "admin" | "agent" | "viewer";
type InvitationRole = Exclude<WorkspaceRole, "owner">;

const invitationRoles: InvitationRole[] = ["agent", "admin", "viewer"];
const allRoles: WorkspaceRole[] = ["owner", ...invitationRoles];

function roleLabel(
  role: string,
  translate: (key: string, fallback: string) => string,
): string {
  const labels: Record<string, [string, string]> = {
    owner: ["ownerRole", "Owner"],
    admin: ["adminRole", "Admin"],
    agent: ["agentRole", "Agent"],
    viewer: ["viewerRole", "Viewer"],
  };
  const match = labels[role];
  return match ? translate(match[0], match[1]) : role;
}

function initials(name: string): string {
  const value = name.trim();
  if (!value) return "?";
  return value
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function formatDate(value: string | null | undefined, locale: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function isInvitationRole(value: string): value is InvitationRole {
  return invitationRoles.includes(value as InvitationRole);
}

export function MembersPanel({
  workspaceId,
  onToast,
  onConfirm,
}: {
  workspaceId: string | null;
  onToast: (message: string) => void;
  onConfirm: Confirm;
}) {
  const { t, i18n } = useTranslation("settings");
  const [members, setMembers] = useState<LiveWorkspaceMember[]>([]);
  const [invitations, setInvitations] = useState<LiveWorkspaceInvitation[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState<WorkspaceRole | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<InvitationRole>("agent");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const roleOptions = useMemo(
    () =>
      allRoles.map((value) => ({
        value,
        label: roleLabel(value, t),
      })),
    [t],
  );
  const invitationRoleOptions = roleOptions.filter(
    (option): option is { value: InvitationRole; label: string } =>
      option.value !== "owner",
  );

  const canManage = currentRole === "owner" || currentRole === "admin";

  const errorMessage = useCallback(
    (reason: unknown, fallback: string) => {
      const code = reason instanceof LiveActionError ? reason.code : undefined;
      const localizedKey =
        code === "workspace_invitation_exists"
          ? "invitationAlreadyOpen"
          : code === "workspace_member_exists"
            ? "memberAlreadyExists"
            : code === "invitation_delivery_failed"
              ? "invitationDeliveryFailed"
              : code === "invitation_service_unavailable" ||
                  code === "invitation_base_url_missing"
                ? "invitationUnavailable"
                : code === "workspace_role_denied" || code === "forbidden"
                  ? "permissionDenied"
                  : null;
      if (localizedKey) return t(localizedKey, fallback);
      return reason instanceof Error ? reason.message : fallback;
    },
    [t],
  );

  const refresh = useCallback(async () => {
    if (!workspaceId) {
      setMembers([]);
      setInvitations([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [user, nextMembers] = await Promise.all([
        getCurrentUser(),
        listLiveWorkspaceMembers(workspaceId),
      ]);
      const self = nextMembers.find((member) => member.userId === user?.id);
      const role = self?.role as WorkspaceRole | undefined;
      const nextInvitations =
        role === "owner" || role === "admin"
          ? await listLiveWorkspaceInvitations(workspaceId)
          : [];
      setCurrentUserId(user?.id ?? null);
      setCurrentRole(role ?? null);
      setMembers(nextMembers);
      setInvitations(nextInvitations);
    } catch (reason) {
      setError(
        errorMessage(
          reason,
          t("membersLoadError", "Não foi possível carregar os membros."),
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [errorMessage, t, workspaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const visibleMembers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return members;
    return members.filter((member) =>
      [member.displayName, member.email, member.userId, member.role]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized)),
    );
  }, [members, query]);

  const visibleInvitations = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return invitations;
    return invitations.filter((invitation) =>
      [invitation.email, invitation.role, invitation.status].some((value) =>
        String(value).toLowerCase().includes(normalized),
      ),
    );
  }, [invitations, query]);

  const runAction = async (key: string, operation: () => Promise<void>) => {
    setAction(key);
    try {
      await operation();
      await refresh();
    } catch (reason) {
      onToast(
        errorMessage(
          reason,
          t("membersActionError", "A ação não pôde ser concluída."),
        ),
      );
    } finally {
      setAction(null);
    }
  };

  const changeMemberRole = (member: LiveWorkspaceMember, role: string) => {
    if (!isWorkspaceRole(role) || role === member.role) return;
    void runAction(`member-role-${member.userId}`, async () => {
      await updateLiveWorkspaceMemberRole({
        workspaceId: workspaceId!,
        userId: member.userId,
        role,
      });
      onToast(t("memberRoleUpdated", "Função do membro atualizada."));
    });
  };

  const changeInvitationRole = (
    invitation: LiveWorkspaceInvitation,
    role: string,
  ) => {
    if (!isInvitationRole(role) || role === invitation.role) return;
    void runAction(`invitation-role-${invitation.id}`, async () => {
      await updateLiveWorkspaceInvitationRole({
        workspaceId: workspaceId!,
        invitationId: invitation.id,
        role,
      });
      onToast(t("invitationRoleUpdated", "Função do convite atualizada."));
    });
  };

  const removeMember = async (member: LiveWorkspaceMember) => {
    if (
      !(await onConfirm({
        title: t("removeMemberTitle", "Remover membro?"),
        description: t(
          "removeMemberDescription",
          "Esta pessoa perderá o acesso a esta workspace. A conta não será excluída.",
        ),
        confirmLabel: t("removeMemberConfirm", "Remover membro"),
        destructive: true,
      }))
    )
      return;
    await runAction(`remove-member-${member.userId}`, async () => {
      await removeLiveWorkspaceMember({
        workspaceId: workspaceId!,
        userId: member.userId,
      });
      onToast(t("memberRemoved", "Membro removido."));
    });
  };

  const revokeInvitation = async (invitation: LiveWorkspaceInvitation) => {
    if (
      !(await onConfirm({
        title: t("revokeInvitationTitle", "Revogar convite?"),
        description: t(
          "revokeInvitationDescription",
          "O link não poderá mais conceder acesso a esta workspace.",
        ),
        confirmLabel: t("revokeInvitationConfirm", "Revogar convite"),
        destructive: true,
      }))
    )
      return;
    await runAction(`revoke-invitation-${invitation.id}`, async () => {
      await revokeLiveWorkspaceInvitation({
        workspaceId: workspaceId!,
        invitationId: invitation.id,
      });
      onToast(t("invitationRevoked", "Convite revogado."));
    });
  };

  const submitInvitation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!workspaceId || !inviteEmail.trim()) return;
    setAction("create-invitation");
    setInviteError(null);
    try {
      await createLiveWorkspaceInvitation({
        workspaceId,
        email: inviteEmail.trim(),
        role: inviteRole,
      });
      setInviteOpen(false);
      setInviteEmail("");
      setInviteRole("agent");
      onToast(t("invitationSent", "Convite enviado."));
      await refresh();
    } catch (reason) {
      setInviteError(
        errorMessage(
          reason,
          t("invitationError", "Não foi possível enviar o convite."),
        ),
      );
    } finally {
      setAction(null);
    }
  };

  const nameFor = (member: LiveWorkspaceMember) =>
    member.displayName || member.email || `User ${member.userId.slice(0, 8)}`;

  return (
    <section className="settings-section members-panel">
      <div className="settings-section-header members-header">
        <div>
          <h2>{t("workspaceMembers", "Membros da workspace")}</h2>
          <p>
            {t(
              "workspaceMembersDescription",
              "Convide pessoas, ajuste funções e mantenha o acesso operacional sob controle.",
            )}
          </p>
        </div>
        <div className="members-header-actions">
          <span className="section-count">
            {members.length} {t("activeMembers", "ativos")}
            {canManage && invitations.length > 0
              ? ` · ${invitations.length} ${t("pendingInvites", "pendentes")}`
              : ""}
          </span>
          {canManage && (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setInviteError(null);
                setInviteOpen(true);
              }}
            >
              <MailPlus /> {t("inviteMember", "Convidar membro")}
            </Button>
          )}
        </div>
      </div>

      <div className="members-toolbar">
        <div className="members-search">
          <Search size={15} aria-hidden="true" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("searchMembers", "Buscar por nome ou e-mail")}
            aria-label={t("searchMembers", "Buscar por nome ou e-mail")}
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          type="button"
          onClick={() => void refresh()}
          disabled={loading || action !== null}
        >
          <RefreshCw className={loading ? "animate-spin" : undefined} />
          {t("refreshMembers", "Atualizar")}
        </Button>
      </div>

      {error && (
        <div className="inline-empty" role="alert">
          <UserRoundX size={16} />
          <span>{error}</span>
          <Button
            className="text-button"
            variant="ghost"
            size="sm"
            type="button"
            onClick={() => void refresh()}
          >
            {t("retry", "Tentar novamente")}
          </Button>
        </div>
      )}

      {loading ? (
        <div className="members-table-shell" aria-busy="true">
          <div className="members-skeleton-row">
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="members-skeleton-row">
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="members-skeleton-row">
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>
      ) : error ? null : visibleMembers.length === 0 &&
        visibleInvitations.length === 0 ? (
        <div className="members-empty">
          <UserRound size={20} />
          <strong>{t("noMembers", "Nenhum membro encontrado")}</strong>
          <span>
            {query
              ? t("clearSearch", "Limpe a busca para ver todos os resultados.")
              : t(
                  "inviteFirstMember",
                  "Convide a primeira pessoa para esta workspace.",
                )}
          </span>
        </div>
      ) : (
        <div className="members-table-shell">
          <Table className="members-table">
            <TableHeader>
              <TableRow>
                <TableHead>{t("memberColumn", "Membro")}</TableHead>
                <TableHead>{t("statusColumn", "Status")}</TableHead>
                <TableHead>{t("roleColumn", "Função")}</TableHead>
                <TableHead>
                  {t("dateColumn", "Adicionado / convidado")}
                </TableHead>
                <TableHead className="members-actions-column">
                  <span className="sr-only">{t("actionsColumn", "Ações")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleMembers.map((member) => {
                const name = nameFor(member);
                const isSelf = member.userId === currentUserId;
                const canChange =
                  canManage &&
                  !isSelf &&
                  (currentRole === "owner" || member.role !== "owner");
                return (
                  <TableRow key={`member-${member.id}`}>
                    <TableCell>
                      <div className="members-person-cell">
                        <div className="avatar avatar-mini avatar-violet">
                          {initials(name)}
                        </div>
                        <div>
                          <strong>{name}</strong>
                          <span>{member.email ?? member.userId}</span>
                        </div>
                        {isSelf && (
                          <Badge variant="outline">{t("you", "Você")}</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className="member-status-badge member-status-active">
                        <UserRoundCheck /> {t("activeStatus", "Ativo")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {canChange ? (
                        <Select
                          value={member.role}
                          onValueChange={(value) =>
                            changeMemberRole(member, value)
                          }
                          disabled={action === `member-role-${member.userId}`}
                        >
                          <SelectTrigger
                            size="sm"
                            aria-label={`${t("roleColumn", "Função")} ${name}`}
                            className="member-role-select"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {roleOptions
                              .filter(
                                (option) =>
                                  currentRole === "owner" ||
                                  option.value !== "owner",
                              )
                              .map((option) => (
                                <SelectItem
                                  key={option.value}
                                  value={option.value}
                                >
                                  {option.label}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="member-role-readonly">
                          {roleLabel(member.role, t)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="member-date-cell">
                      {formatDate(member.createdAt, i18n.language)}
                    </TableCell>
                    <TableCell className="members-actions-cell">
                      {canChange && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`${t("actionsColumn", "Ações")} ${name}`}
                            >
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => void removeMember(member)}
                              disabled={
                                action === `remove-member-${member.userId}`
                              }
                            >
                              <Trash2 /> {t("removeMember", "Remover membro")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {visibleInvitations.map((invitation) => (
                <TableRow key={`invitation-${invitation.id}`}>
                  <TableCell>
                    <div className="members-person-cell">
                      <div className="avatar avatar-mini avatar-neutral">
                        <MailPlus size={14} />
                      </div>
                      <div>
                        <strong>{invitation.email}</strong>
                        <span>{t("invitedMember", "Convite de membro")}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={`member-status-badge member-status-${invitation.status}`}
                    >
                      {invitation.status === "expired" ? (
                        <Clock3 />
                      ) : invitation.status === "failed" ? (
                        <UserRoundX />
                      ) : (
                        <MailPlus />
                      )}
                      {invitation.status === "expired"
                        ? t("expiredStatus", "Expirado")
                        : invitation.status === "failed"
                          ? t("failedStatus", "Falhou")
                          : t("pendingStatus", "Pendente")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={invitation.role}
                      onValueChange={(value) =>
                        changeInvitationRole(invitation, value)
                      }
                      disabled={action === `invitation-role-${invitation.id}`}
                    >
                      <SelectTrigger
                        size="sm"
                        aria-label={`${t("roleColumn", "Função")} ${invitation.email}`}
                        className="member-role-select"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {invitationRoleOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="member-date-cell">
                    {formatDate(
                      invitation.sentAt ?? invitation.createdAt,
                      i18n.language,
                    )}
                  </TableCell>
                  <TableCell className="members-actions-cell">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`${t("actionsColumn", "Ações")} ${invitation.email}`}
                        >
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() =>
                            void runAction(
                              `resend-${invitation.id}`,
                              async () => {
                                await resendLiveWorkspaceInvitation({
                                  workspaceId: workspaceId!,
                                  invitationId: invitation.id,
                                });
                                onToast(
                                  t("invitationResent", "Convite reenviado."),
                                );
                              },
                            )
                          }
                          disabled={action === `resend-${invitation.id}`}
                        >
                          <RefreshCw />{" "}
                          {t("resendInvitation", "Reenviar convite")}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => void revokeInvitation(invitation)}
                          disabled={
                            action === `revoke-invitation-${invitation.id}`
                          }
                        >
                          <Trash2 /> {t("revokeInvitation", "Revogar convite")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <form onSubmit={(event) => void submitInvitation(event)}>
            <DialogHeader>
              <DialogTitle>{t("inviteMember", "Convidar membro")}</DialogTitle>
              <DialogDescription>
                {t(
                  "inviteDescription",
                  "Envie um link seguro para a pessoa criar a senha e entrar nesta workspace.",
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="members-invite-form">
              <div className="members-form-field">
                <Label htmlFor="invite-member-email">
                  {t("emailColumn", "E-mail")}
                </Label>
                <Input
                  id="invite-member-email"
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  placeholder="pessoa@empresa.com"
                  autoComplete="email"
                />
              </div>
              <div className="members-form-field">
                <Label htmlFor="invite-member-role">
                  {t("roleColumn", "Função")}
                </Label>
                <Select
                  value={inviteRole}
                  onValueChange={(value) => {
                    if (isInvitationRole(value)) setInviteRole(value);
                  }}
                >
                  <SelectTrigger id="invite-member-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {invitationRoleOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {inviteError && (
                <p className="members-form-error" role="alert">
                  {inviteError}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => setInviteOpen(false)}
              >
                {t("cancel", "Cancelar")}
              </Button>
              <Button type="submit" disabled={action === "create-invitation"}>
                <MailPlus />{" "}
                {action === "create-invitation"
                  ? t("sendingInvite", "Enviando…")
                  : t("sendInvite", "Enviar convite")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function isWorkspaceRole(value: string): value is WorkspaceRole {
  return allRoles.includes(value as WorkspaceRole);
}
