import { create } from "zustand"

export type TasksListLegendEntry = { key: string; label: string; colorClass: string }

type State = {
  entries: TasksListLegendEntry[]
  title: string
  setListToolbarLegend: (entries: TasksListLegendEntry[], title: string) => void
  clearListToolbarLegend: () => void
}

export const useTasksListLegendStore = create<State>((set) => ({
  entries: [],
  title: "",
  setListToolbarLegend: (entries, title) => set({ entries, title }),
  clearListToolbarLegend: () => set({ entries: [], title: "" }),
}))
