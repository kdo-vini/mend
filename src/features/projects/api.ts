import { apiRequest } from "../../api/transport";
export interface Project {
  id: string;
  key: string;
  name: string;
  description: string;
  status: "active" | "archived";
  version: number;
}
export const projectsApi = {
  list: () => apiRequest<{ data: Project[] }>("/api/projects"),
  save: (record: Omit<Project, "version">, version: number | null) =>
    apiRequest<Project>("/api/projects", {
      method: "POST",
      body: JSON.stringify({ record, version }),
    }),
};
