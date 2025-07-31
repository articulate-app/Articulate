import { create } from 'zustand';

interface CurrentUserState {
  publicUserId: number | null;
  fullName: string | null;
  userMetadata: any | null;
  setPublicUserId: (id: number | null) => void;
  setFullName: (name: string | null) => void;
  setUserMetadata: (metadata: any | null) => void;
}

export const useCurrentUserStore = create<CurrentUserState>((set) => ({
  publicUserId: null,
  fullName: null,
  userMetadata: null,
  setPublicUserId: (id) => set({ publicUserId: id }),
  setFullName: (name) => set({ fullName: name }),
  setUserMetadata: (metadata) => set({ userMetadata: metadata }),
})); 