import {
  apiRequest,
  isDemoModeRequested,
  LiveActionError,
} from "../../api/transport";
export interface Project {
  id: string;
  key: string;
  name: string;
  description: string;
  status: "active" | "archived";
  version: number;
}

/** In-memory catalog for `?demo=1`, which has no API behind it. */
const demoProjects: Project[] = [
  {
    id: "demo-project-zelo",
    key: "ZELO",
    name: "Zelo",
    description: "Suíte de gestão para negócios de alimentação.",
    status: "active",
    version: 1,
  },
  {
    id: "demo-project-sagevu",
    key: "SAGEVU",
    name: "Sagevu",
    description: "Backend SaaS e app mobile.",
    status: "active",
    version: 1,
  },
];

function saveDemoProject(
  record: Omit<Project, "version">,
  version: number | null,
): Project {
  const index = demoProjects.findIndex((project) => project.id === record.id);
  if (index === -1) {
    const created = { ...record, version: 1 };
    demoProjects.push(created);
    return created;
  }
  if (version !== demoProjects[index].version)
    throw new LiveActionError("Conflict", 409, "project_conflict");
  const updated = { ...record, version: version + 1 };
  demoProjects[index] = updated;
  return updated;
}

/**
 * `?demo=1` normally has no API behind it, but e2e and local setups may mock
 * one. Prefer a real API answer; fall back to the in-memory catalog only when
 * there is none (no response, or a non-JSON page).
 */
const noApiAnswer = (error: unknown) =>
  !(error instanceof LiveActionError && error.status);

export const projectsApi = {
  list: async (): Promise<{ data: Project[] }> => {
    try {
      const result = await apiRequest<{ data: Project[] } | undefined>(
        "/api/projects",
      );
      if (!result || !Array.isArray(result.data))
        throw new LiveActionError("Invalid projects response.");
      return result;
    } catch (error) {
      // Otherwise the page shows its localized load error, never a raw TypeError.
      if (isDemoModeRequested() && noApiAnswer(error))
        return { data: demoProjects.map((project) => ({ ...project })) };
      throw error;
    }
  },
  save: async (
    record: Omit<Project, "version">,
    version: number | null,
  ): Promise<Project> => {
    try {
      const saved = await apiRequest<Project | undefined>("/api/projects", {
        method: "POST",
        body: JSON.stringify({ record, version }),
      });
      if (!saved) throw new LiveActionError("Invalid projects response.");
      return saved;
    } catch (error) {
      if (isDemoModeRequested() && noApiAnswer(error))
        return saveDemoProject(record, version);
      throw error;
    }
  },
};
