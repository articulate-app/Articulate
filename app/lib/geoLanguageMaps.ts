export interface Region {
  id: string;
  name: string;
}

export interface Language {
  id: string;
  name: string;
}

export const regions: Region[] = [
  { id: '', name: 'Any' },
  { id: '2840', name: 'United States' },
  { id: '2826', name: 'United Kingdom' },
  { id: '2250', name: 'Portugal' },
  { id: '2724', name: 'Spain' },
  { id: '2076', name: 'Brazil' },
  { id: '2276', name: 'Germany' },
  { id: '2252', name: 'France' },
];

export const languages: Language[] = [
  { id: '', name: 'Any' },
  { id: '1000', name: 'English' },
  { id: '1014', name: 'Portuguese' },
  { id: '1003', name: 'Spanish' },
  { id: '1002', name: 'French' },
  { id: '1001', name: 'German' },
]; 