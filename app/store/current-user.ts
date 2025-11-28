import { create } from 'zustand';

export interface UserTeam {
  team_id: number;
  team_name: string;
}

interface CurrentUserState {
  publicUserId: number | null;
  fullName: string | null;
  userMetadata: any | null;
  userTeams: UserTeam[];
  setPublicUserId: (id: number | null) => void;
  setFullName: (name: string | null) => void;
  setUserMetadata: (metadata: any | null) => void;
  setUserTeams: (teams: UserTeam[]) => void;
}

export const useCurrentUserStore = create<CurrentUserState>((set) => ({
  publicUserId: null,
  fullName: null,
  userMetadata: null,
  userTeams: [],
  setPublicUserId: (id) => set({ publicUserId: id }),
  setFullName: (name) => set({ fullName: name }),
  setUserMetadata: (metadata) => set({ userMetadata: metadata }),
  setUserTeams: (teams) => set({ userTeams: teams }),
})); 