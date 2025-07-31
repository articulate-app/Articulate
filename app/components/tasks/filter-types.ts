// Types for task filters

export type FilterOption = {
  id: number;
  label: string;
  color?: string;
};

export type FilterKey =
  | 'assignedTo'
  | 'status'
  | 'project'
  | 'contentType'
  | 'productionType'
  | 'language'
  | 'deliveryDate'
  | 'publicationDate';

export type DateRangeValue = {
  from: string | null;
  to: string | null;
}; 