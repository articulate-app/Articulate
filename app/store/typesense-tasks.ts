import { create } from 'zustand';

interface TypesenseTask {
  id: string | number;
  [key: string]: any;
}

type SetTasksArg = TypesenseTask[] | ((prev: TypesenseTask[]) => TypesenseTask[]);

interface TypesenseTasksState {
  tasks: TypesenseTask[];
  page: number;
  hasMore: boolean;
  isFetching: boolean;
  setTasks: (tasks: SetTasksArg) => void;
  updateTask: (updatedTask: TypesenseTask) => void;
  addTask: (newTask: TypesenseTask) => void;
  removeTask: (taskId: string | number) => void;
  resetTasks: () => void;
  setPage: (page: number) => void;
  setHasMore: (hasMore: boolean) => void;
  setIsFetching: (isFetching: boolean) => void;
  updater: ((task: any) => void) | null;
  setUpdater: (fn: (task: any) => void) => void;
}

export const useTypesenseTasksStore = create<TypesenseTasksState>((set, get) => ({
  tasks: [],
  page: 1,
  hasMore: true,
  isFetching: false,
  setTasks: (tasksOrUpdater) => set((state) => {
    const newTasks = typeof tasksOrUpdater === 'function' ? (tasksOrUpdater as (prev: TypesenseTask[]) => TypesenseTask[])(state.tasks) : tasksOrUpdater;
    console.log('[Zustand] setTasks called. New tasks:', newTasks);
    return { tasks: newTasks };
  }),
  updateTask: (updatedTask) => set((state) => {
    const newTasks = state.tasks.map((task) => String(task.id) === String(updatedTask.id) ? { ...task, ...updatedTask } : task);
    console.log('[Zustand] updateTask called. Updated task:', updatedTask, 'New tasks:', newTasks);
    return { tasks: newTasks };
  }),
  addTask: (newTask) => set((state) => {
    // Check if task already exists
    const existingIndex = state.tasks.findIndex((task) => String(task.id) === String(newTask.id));
    if (existingIndex !== -1) {
      // Update existing task
      const newTasks = [...state.tasks];
      newTasks[existingIndex] = { ...newTasks[existingIndex], ...newTask };
      console.log('[Zustand] addTask called. Updated existing task:', newTask);
      return { tasks: newTasks };
    } else {
      // For new tasks, we'll add them at the beginning for now
      // The proper sorting will be handled by the Typesense query when it refetches
      const newTasks = [newTask, ...state.tasks];
      console.log('[Zustand] addTask called. Added new task:', newTask);
      return { tasks: newTasks };
    }
  }),
  removeTask: (taskId) => set((state) => {
    const newTasks = state.tasks.filter((task) => String(task.id) !== String(taskId));
    console.log('[Zustand] removeTask called. Removed task:', taskId, 'New tasks count:', newTasks.length);
    return { tasks: newTasks };
  }),
  resetTasks: () => set({ tasks: [], page: 1, hasMore: true, isFetching: false }),
  setPage: (page) => set({ page }),
  setHasMore: (hasMore) => set({ hasMore }),
  setIsFetching: (isFetching) => set({ isFetching }),
  updater: null,
  setUpdater: (fn) => set({ updater: fn }),
}));

export const setTypesenseUpdater = (fn: (task: any) => void) => useTypesenseTasksStore.getState().setUpdater(fn);
export const getTypesenseUpdater = () => useTypesenseTasksStore.getState().updater;
export const addTaskToTypesenseStore = (task: any) => useTypesenseTasksStore.getState().addTask(task);
export const removeTaskFromTypesenseStore = (taskId: string | number) => useTypesenseTasksStore.getState().removeTask(taskId); 