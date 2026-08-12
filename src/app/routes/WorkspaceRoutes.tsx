import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

// i18n-exempt: route composition only; all rendered elements own their copy.

export interface WorkspaceRouteElements {
  inbox: ReactNode;
  issues: ReactNode;
  kanban: ReactNode;
  issueDetail: ReactNode;
  runs: ReactNode;
  knowledge: ReactNode;
  settings: ReactNode;
  profile: ReactNode;
  fallback: ReactNode;
}

export function WorkspaceRoutes(elements: WorkspaceRouteElements) {
  return (
    <Routes>
      <Route path="/" element={<Navigate replace to="/inbox" />} />
      <Route path="/inbox" element={elements.inbox} />
      <Route path="/issues" element={elements.issues} />
      <Route path="/issues/:identifier" element={elements.issueDetail} />
      <Route path="/kanban" element={elements.kanban} />
      <Route path="/agent-runs" element={elements.runs} />
      <Route path="/knowledge" element={elements.knowledge} />
      <Route path="/settings/*" element={elements.settings} />
      <Route path="/profile" element={elements.profile} />
      <Route path="*" element={elements.fallback} />
    </Routes>
  );
}
