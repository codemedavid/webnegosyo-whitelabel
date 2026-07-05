import { create } from "zustand";
import type { WorkspaceKey } from "../lib/workspaces";

interface WorkspaceState {
  /** The active view; the tab bar only shows this view's tabs. */
  workspace: WorkspaceKey;
  setWorkspace: (workspace: WorkspaceKey) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  workspace: "operations",
  setWorkspace: (workspace) => set({ workspace }),
}));
