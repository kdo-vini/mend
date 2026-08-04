import { z } from "zod";
import type { MendAuthContext } from "./auth.js";
import {
  createWorkspace,
  listMyWorkspaces,
  workspaceCreateSchema,
  workspaceMemberRoleSchema,
  type WorkspaceWithRole,
} from "./workspaces.js";

export type BootstrapWorkspaceInput = z.input<typeof workspaceCreateSchema>;

export type WorkspaceBootstrapErrorCode =
  | "workspace_already_exists"
  | "workspace_not_visible"
  | "workspace_role_invalid"
  | "workspace_owner_required"
  | "workspace_slug_mismatch";

export class WorkspaceBootstrapError extends Error {
  readonly code: WorkspaceBootstrapErrorCode;

  constructor(code: WorkspaceBootstrapErrorCode, message: string) {
    super(message);
    this.name = "WorkspaceBootstrapError";
    this.code = code;
  }
}

export interface WorkspaceBootstrapDependencies {
  list: (auth: MendAuthContext) => Promise<WorkspaceWithRole[]>;
  create: (
    auth: MendAuthContext,
    input: BootstrapWorkspaceInput,
  ) => Promise<WorkspaceWithRole>;
}

export interface WorkspaceBootstrapAdapter {
  listWorkspaces(): Promise<WorkspaceWithRole[]>;
  createFirstWorkspace(
    input: BootstrapWorkspaceInput,
  ): Promise<WorkspaceWithRole>;
}

const defaultDependencies: WorkspaceBootstrapDependencies = {
  list: listMyWorkspaces,
  create: createWorkspace,
};

/** Parses and normalizes the same workspace input accepted by server/workspaces.ts. */
export function parseBootstrapWorkspaceInput(
  input: unknown,
): z.output<typeof workspaceCreateSchema> {
  return workspaceCreateSchema.parse(input);
}

function validateWorkspaceRole(
  workspace: WorkspaceWithRole,
): WorkspaceWithRole {
  const parsedRole = workspaceMemberRoleSchema.safeParse(workspace.role);
  if (!parsedRole.success) {
    throw new WorkspaceBootstrapError(
      "workspace_role_invalid",
      "Supabase returned an invalid workspace role.",
    );
  }
  return { ...workspace, role: parsedRole.data };
}

function validateCreatedWorkspace(
  workspace: WorkspaceWithRole,
  expectedSlug: string,
): WorkspaceWithRole {
  const validated = validateWorkspaceRole(workspace);
  if (validated.slug !== expectedSlug) {
    throw new WorkspaceBootstrapError(
      "workspace_slug_mismatch",
      "The created workspace slug did not match the requested slug.",
    );
  }
  if (validated.role !== "owner") {
    throw new WorkspaceBootstrapError(
      "workspace_owner_required",
      "The first workspace must be owned by the authenticated user.",
    );
  }
  return validated;
}

/**
 * Creates the first workspace for an authenticated user through the existing
 * create_workspace RPC wrapper. The RPC derives the owner membership from
 * auth.uid(); this module never accepts or invents a user/member id.
 */
export function createWorkspaceBootstrapAdapter(
  auth: MendAuthContext,
  dependencies: WorkspaceBootstrapDependencies = defaultDependencies,
): WorkspaceBootstrapAdapter {
  return {
    async listWorkspaces() {
      return (await dependencies.list(auth)).map(validateWorkspaceRole);
    },

    async createFirstWorkspace(input) {
      const values = parseBootstrapWorkspaceInput(input);
      const existing = await this.listWorkspaces();
      if (existing.length > 0) {
        throw new WorkspaceBootstrapError(
          "workspace_already_exists",
          "The authenticated user already has a workspace.",
        );
      }

      const created = await dependencies.create(auth, values);
      const visible = (await dependencies.list(auth))
        .map(validateWorkspaceRole)
        .find((workspace) => workspace.id === created.id);
      if (!visible) {
        throw new WorkspaceBootstrapError(
          "workspace_not_visible",
          "The workspace was created but is not visible to the authenticated user.",
        );
      }
      return validateCreatedWorkspace(visible, values.slug);
    },
  };
}

export function listBootstrapWorkspaces(
  auth: MendAuthContext,
  dependencies?: WorkspaceBootstrapDependencies,
): Promise<WorkspaceWithRole[]> {
  return createWorkspaceBootstrapAdapter(auth, dependencies).listWorkspaces();
}

export function createFirstWorkspace(
  auth: MendAuthContext,
  input: BootstrapWorkspaceInput,
  dependencies?: WorkspaceBootstrapDependencies,
): Promise<WorkspaceWithRole> {
  return createWorkspaceBootstrapAdapter(
    auth,
    dependencies,
  ).createFirstWorkspace(input);
}
