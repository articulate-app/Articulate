"use client";

import { create } from "zustand";

/** Draft shape matching AddTaskForm schema (subset of fields for display) */
export interface TaskComposerDraft {
  title?: string;
  project_id_int?: string;
  project_status_id?: string;
  briefing?: string;
  [key: string]: unknown;
}

export interface TaskComposer {
  id: string;
  isMinimized: boolean;
  draft: TaskComposerDraft;
  dirty: boolean;
  createdAt: number;
  /** Optional: pre-fill project when opened from project/calendar context */
  defaultProjectId?: number;
  /** Optional: parent task for subtask creation */
  parentTaskId?: string;
  parentTaskTitle?: string;
  parentProjectName?: string;
  parentProjectId?: string | number;
}

const MAX_VISIBLE = 3;

interface TaskComposerState {
  composers: TaskComposer[];
  /** Pending close: id of composer awaiting discard confirmation */
  pendingCloseId: string | null;
  openComposer: (initial?: Partial<TaskComposerDraft> & { defaultProjectId?: number; parentTaskId?: string; parentTaskTitle?: string; parentProjectName?: string; parentProjectId?: string | number }) => string;
  closeComposer: (id: string) => void;
  /** Force close without confirm (after user confirms discard) */
  forceCloseComposer: (id: string) => void;
  updateDraft: (id: string, patch: Partial<TaskComposerDraft>) => void;
  setDirty: (id: string, dirty: boolean) => void;
  minimizeComposer: (id: string) => void;
  expandComposer: (id: string) => void;
  requestCloseComposer: (id: string) => void;
  cancelPendingClose: (id: string) => void;
  confirmDiscard: (id: string) => void;
  /** Visible composers (bottom-aligned, newest at bottom) */
  visibleComposers: () => TaskComposer[];
  /** Overflow count when > MAX_VISIBLE */
  overflowCount: () => number;
}

function generateId() {
  return "composer-" + Date.now() + "-" + Math.random().toString(36).slice(2, 9);
}

export const useTaskComposerStore = create<TaskComposerState>((set, get) => ({
  composers: [],
  pendingCloseId: null,

  openComposer: (initial) => {
    const id = generateId();
    const draft: TaskComposerDraft = {
      title: "",
      project_id_int: initial?.defaultProjectId ? String(initial.defaultProjectId) : initial?.project_id_int ?? "",
      project_status_id: initial?.project_status_id ?? "",
      briefing: initial?.briefing ?? "",
      ...initial,
    };
    const composer: TaskComposer = {
      id,
      isMinimized: false,
      draft,
      dirty: false,
      createdAt: Date.now(),
      defaultProjectId: initial?.defaultProjectId,
      parentTaskId: initial?.parentTaskId,
      parentTaskTitle: initial?.parentTaskTitle,
      parentProjectName: initial?.parentProjectName,
      parentProjectId: initial?.parentProjectId,
    };
    set((s) => ({
      composers: [...s.composers, composer],
    }));
    return id;
  },

  closeComposer: (id) => {
    const composer = get().composers.find((c) => c.id === id);
    if (!composer) return;
    if (composer.dirty) {
      set({ pendingCloseId: id });
    } else {
      get().forceCloseComposer(id);
    }
  },

  forceCloseComposer: (id) => {
    set((s) => ({
      composers: s.composers.filter((c) => c.id !== id),
      pendingCloseId: s.pendingCloseId === id ? null : s.pendingCloseId,
    }));
  },

  updateDraft: (id, patch) => {
    set((s) => {
      let hasChanged = false;
      const composers = s.composers.map((c) => {
        if (c.id !== id) return c;
        const nextDraft = { ...c.draft, ...patch };
        const isSameDraft =
          c.draft.title === nextDraft.title &&
          c.draft.project_id_int === nextDraft.project_id_int &&
          c.draft.project_status_id === nextDraft.project_status_id &&
          c.draft.briefing === nextDraft.briefing;
        if (isSameDraft) return c;
        hasChanged = true;
        return { ...c, draft: nextDraft };
      });
      return hasChanged ? { composers } : s;
    });
  },

  setDirty: (id, dirty) => {
    set((s) => {
      let hasChanged = false;
      const composers = s.composers.map((c) => {
        if (c.id !== id) return c;
        if (c.dirty === dirty) return c;
        hasChanged = true;
        return { ...c, dirty };
      });
      return hasChanged ? { composers } : s;
    });
  },

  minimizeComposer: (id) => {
    set((s) => {
      let hasChanged = false;
      const composers = s.composers.map((c) => {
        if (c.id !== id || c.isMinimized) return c;
        hasChanged = true;
        return { ...c, isMinimized: true };
      });
      return hasChanged ? { composers } : s;
    });
  },

  expandComposer: (id) => {
    set((s) => {
      let hasChanged = false;
      const composers = s.composers.map((c) => {
        if (c.id !== id || !c.isMinimized) return c;
        hasChanged = true;
        return { ...c, isMinimized: false };
      });
      return hasChanged ? { composers } : s;
    });
  },

  requestCloseComposer: (id) => {
    get().closeComposer(id);
  },

  cancelPendingClose: (id) => {
    set((s) => (s.pendingCloseId === id ? { pendingCloseId: null } : {}));
  },

  confirmDiscard: (id) => {
    get().forceCloseComposer(id);
  },

  visibleComposers: () => {
    const { composers } = get();
    return composers.slice(-MAX_VISIBLE);
  },

  overflowCount: () => {
    const { composers } = get();
    return Math.max(0, composers.length - MAX_VISIBLE);
  },
}));
