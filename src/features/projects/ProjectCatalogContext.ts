import { createContext } from "react";
import type { Project } from "./api";
export const ProjectCatalogContext = createContext<Project[]>([]);
