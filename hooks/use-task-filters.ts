import { useState, useEffect, useCallback } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export interface FilterState {
  assignedTo: string[];
  status: string[];
  deliveryDate: { from: string; to: string };
  publicationDate: { from: string; to: string };
  project: string[];
  contentType: string[];
  productionType: string[];
  language: string[];
}

export interface FilterOptions {
  users: { id: string; label: string; value: string }[];
  statuses: { id: string; label: string; value: string }[];
  projects: { id: string; label: string; value: string }[];
  contentTypes: { id: string; label: string; value: string }[];
  productionTypes: { id: string; label: string; value: string }[];
  languages: { id: string; label: string; value: string }[];
}

export function useTaskFilters() {
  // Initialize Supabase client first
  const supabase = createClientComponentClient();

  // Initialize all state hooks together
  const [state, setState] = useState({
    filters: {
      assignedTo: [],
      status: [],
      deliveryDate: { from: '', to: '' },
      publicationDate: { from: '', to: '' },
      project: [],
      contentType: [],
      productionType: [],
      language: [],
    } as FilterState,
    options: {
      users: [],
      statuses: [],
      projects: [],
      contentTypes: [],
      productionTypes: [],
      languages: [],
    } as FilterOptions,
    isLoading: true,
  });

  // Memoized functions
  const handleFilterChange = useCallback((newFilters: FilterState) => {
    setState(prev => ({
      ...prev,
      filters: newFilters,
    }));
  }, []);

  // Effect for fetching options
  useEffect(() => {
    let mounted = true;

    const fetchOptions = async () => {
      try {
        setState(prev => ({ ...prev, isLoading: true }));

        // Fetch users
        const { data: users } = await supabase
          .from('users')
          .select('id, full_name')
          .order('full_name');

        // Fetch statuses
        const { data: statuses } = await supabase
          .from('project_statuses')
          .select('id, name')
          .order('name');

        // Fetch projects
        const { data: projects } = await supabase
          .from('projects')
          .select('id, name')
          .order('name');

        // Fetch content types
        const { data: contentTypes } = await supabase
          .from('content_types')
          .select('id, title')
          .order('title');

        // Fetch production types
        const { data: productionTypes } = await supabase
          .from('production_types')
          .select('id, title')
          .order('title');

        // Fetch languages
        const { data: languages } = await supabase
          .from('languages')
          .select('id, code')
          .order('code');

        if (mounted) {
          setState(prev => ({
            ...prev,
            options: {
              users: users?.map(user => ({ id: user.id, label: user.full_name, value: user.id })) || [],
              statuses: statuses?.map(status => ({ id: status.id, label: status.name, value: status.id })) || [],
              projects: projects?.map(project => ({ id: project.id, label: project.name, value: project.id })) || [],
              contentTypes: contentTypes?.map(type => ({ id: type.id, label: type.title, value: type.id })) || [],
              productionTypes: productionTypes?.map(type => ({ id: type.id, label: type.title, value: type.id })) || [],
              languages: languages?.map(lang => ({ id: lang.id, label: lang.code, value: lang.id })) || [],
            },
            isLoading: false,
          }));
        }
      } catch (error) {
        console.error('Error fetching filter options:', error);
        if (mounted) {
          setState(prev => ({ ...prev, isLoading: false }));
        }
      }
    };

    fetchOptions();

    return () => {
      mounted = false;
    };
  }, [supabase]);

  const getActiveFilterCount = useCallback(() => {
    return Object.entries(state.filters).reduce((count, [key, value]) => {
      if (Array.isArray(value)) {
        return count + value.length;
      } else if (typeof value === 'object' && value !== null) {
        return count + (value.from || value.to ? 1 : 0);
      }
      return count;
    }, 0);
  }, [state.filters]);

  const getActiveFilterBadges = useCallback(() => {
    const badges: { id: string; label: string; value: string; onRemove: () => void }[] = [];

    // Add array-based filters
    Object.entries(state.filters).forEach(([key, value]) => {
      if (Array.isArray(value) && value.length > 0) {
        value.forEach(item => {
          const option = state.options[key as keyof FilterOptions]?.find(o => o.value === item);
          if (option) {
            badges.push({
              id: `${key}-${item}`,
              label: key.replace(/([A-Z])/g, ' $1').trim(),
              value: option.label,
              onRemove: () => {
                setState(prev => ({
                  ...prev,
                  filters: {
                    ...prev.filters,
                    [key]: (prev.filters[key as keyof FilterState] as string[]).filter((v: string) => v !== item),
                  },
                }));
              },
            });
          }
        });
      } else if (typeof value === 'object' && value !== null) {
        const { from, to } = value as { from: string; to: string };
        if (from || to) {
          badges.push({
            id: key,
            label: key.replace(/([A-Z])/g, ' $1').trim(),
            value: `${from || 'Start'} - ${to || 'End'}`,
            onRemove: () => {
              setState(prev => ({
                ...prev,
                filters: {
                  ...prev.filters,
                  [key]: { from: '', to: '' },
                },
              }));
            },
          });
        }
      }
    });

    return badges;
  }, [state.filters, state.options]);

  const buildQuery = useCallback(() => {
    let query = supabase.from('tasks').select('*');

    // Apply filters
    if (state.filters.assignedTo.length > 0) {
      query = query.in('assigned_to_id', state.filters.assignedTo);
    }

    if (state.filters.status.length > 0) {
      query = query.in('project_status_name', state.filters.status);
    }

    if (state.filters.project.length > 0) {
      query = query.in('project_id_int', state.filters.project);
    }

    if (state.filters.contentType.length > 0) {
      query = query.in('content_type_id', state.filters.contentType);
    }

    if (state.filters.productionType.length > 0) {
      query = query.in('production_type_id', state.filters.productionType);
    }

    if (state.filters.language.length > 0) {
      query = query.in('language_id', state.filters.language);
    }

    if (state.filters.deliveryDate.from) {
      query = query.gte('delivery_date', state.filters.deliveryDate.from);
    }

    if (state.filters.deliveryDate.to) {
      query = query.lte('delivery_date', state.filters.deliveryDate.to);
    }

    if (state.filters.publicationDate.from) {
      query = query.gte('publication_date', state.filters.publicationDate.from);
    }

    if (state.filters.publicationDate.to) {
      query = query.lte('publication_date', state.filters.publicationDate.to);
    }

    return query;
  }, [state.filters, supabase]);

  return {
    filters: state.filters,
    setFilters: handleFilterChange,
    options: state.options,
    isLoading: state.isLoading,
    getActiveFilterCount,
    getActiveFilterBadges,
    buildQuery,
  };
} 