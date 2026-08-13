import type { ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import {
  issueWorkspaceView,
  legacyKanbanDestination,
} from "./workspace-routing";

// i18n-exempt: route composition only; all rendered elements own their copy.

export interface WorkspaceRouteElements {
  inbox: ReactNode;
  issuesList: ReactNode;
  issuesBoard: ReactNode;
  myWork: ReactNode;
  issueDetail: ReactNode;
  runs: ReactNode;
  knowledge: ReactNode;
  settings: ReactNode;
  profile: ReactNode;
  fallback: ReactNode;
}

function IssuesWorkspaceRoute({
  list,
  board,
}: {
  list: ReactNode;
  board: ReactNode;
}) {
  const { search } = useLocation();
  return issueWorkspaceView(search) === "board" ? board : list;
}

function LegacyKanbanRedirect() {
  const { search } = useLocation();
  return <Navigate replace to={legacyKanbanDestination(search)} />;
}

export function WorkspaceRoutes(elements: WorkspaceRouteElements) {
  return (
    <Routes>
      <Route path="/" element={<Navigate replace to="/inbox" />} />
      <Route path="/inbox" element={elements.inbox} />
      <Route
        path="/issues"
        element={
          <IssuesWorkspaceRoute
            list={elements.issuesList}
            board={elements.issuesBoard}
          />
        }
      />
      <Route path="/issues/:identifier" element={elements.issueDetail} />
      <Route path="/my-work" element={elements.myWork} />
      <Route path="/kanban" element={<LegacyKanbanRedirect />} />
      <Route path="/agent-runs" element={elements.runs} />
      <Route path="/knowledge" element={elements.knowledge} />
      <Route path="/settings/*" element={elements.settings} />
      <Route path="/profile" element={elements.profile} />
      <Route path="*" element={elements.fallback} />
    </Routes>
  );
}
