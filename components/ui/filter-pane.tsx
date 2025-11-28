"use client"

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { X, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FilterOption {
  id: string | number;
  label: string;
  value: string | number;
}

interface FilterState {
  assignedTo: string[];
  status: string[];
  deliveryDate: { from: string; to: string };
  publicationDate: { from: string; to: string };
  project: string[];
  contentType: string[];
  productionType: string[];
  language: string[];
}

interface FilterPaneProps {
  isOpen: boolean;
  onClose: () => void;
  onFilterChange: (filters: FilterState) => void;
  className?: string;
}

export function FilterPane({ isOpen, onClose, onFilterChange, className }: FilterPaneProps) {
  const [filters, setFilters] = useState<FilterState>({
    assignedTo: [],
    status: [],
    deliveryDate: { from: '', to: '' },
    publicationDate: { from: '', to: '' },
    project: [],
    contentType: [],
    productionType: [],
    language: [],
  });

  const [options, setOptions] = useState<{
    users: FilterOption[];
    statuses: FilterOption[];
    projects: FilterOption[];
    contentTypes: FilterOption[];
    productionTypes: FilterOption[];
    languages: FilterOption[];
  }>({
    users: [],
    statuses: [],
    projects: [],
    contentTypes: [],
    productionTypes: [],
    languages: [],
  });

  const supabase = createClientComponentClient();

  useEffect(() => {
    const fetchOptions = async () => {
      // Fetch users
      const { data: users } = await supabase
        .from('view_users_i_can_see')
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

      setOptions({
        users: users?.map(user => ({ id: user.id, label: user.full_name, value: user.id })) || [],
        statuses: statuses?.map(status => ({ id: status.id, label: status.name, value: status.id })) || [],
        projects: projects?.map(project => ({ id: project.id, label: project.name, value: project.id })) || [],
        contentTypes: contentTypes?.map(type => ({ id: type.id, label: type.title, value: type.id })) || [],
        productionTypes: productionTypes?.map(type => ({ id: type.id, label: type.title, value: type.id })) || [],
        languages: languages?.map(lang => ({ id: lang.id, label: lang.code, value: lang.id })) || [],
      });
    };

    fetchOptions();
  }, [supabase]);

  const handleFilterChange = (key: keyof FilterState, value: any) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const handleClearAll = () => {
    const emptyFilters: FilterState = {
      assignedTo: [],
      status: [],
      deliveryDate: { from: '', to: '' },
      publicationDate: { from: '', to: '' },
      project: [],
      contentType: [],
      productionType: [],
      language: [],
    };
    setFilters(emptyFilters);
    onFilterChange(emptyFilters);
  };

  return (
    <div
      className={cn(
        'fixed right-0 top-0 h-full w-80 bg-white shadow-lg transform transition-transform duration-300 ease-in-out z-50',
        isOpen ? 'translate-x-0' : 'translate-x-full',
        className
      )}
    >
      <div className="p-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Filters</h2>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearAll}
              className="text-muted-foreground"
            >
              Clear all
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          {/* Assigned To Filter */}
          <div>
            <label className="block text-sm font-medium mb-1">Assigned To</label>
            <select
              multiple
              className="w-full p-2 border rounded"
              value={filters.assignedTo}
              onChange={(e) => handleFilterChange('assignedTo', Array.from(e.target.selectedOptions, option => option.value))}
            >
              {options.users.map((user) => (
                <option key={user.id} value={user.value}>
                  {user.label}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-sm font-medium mb-1">Status</label>
            <select
              multiple
              className="w-full p-2 border rounded"
              value={filters.status}
              onChange={(e) => handleFilterChange('status', Array.from(e.target.selectedOptions, option => option.value))}
            >
              {options.statuses.map((status) => (
                <option key={status.id} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </div>

          {/* Delivery Date Range */}
          <div>
            <label className="block text-sm font-medium mb-1">Delivery Date</label>
            <div className="space-y-2">
              <Input
                type="date"
                placeholder="From"
                value={filters.deliveryDate.from}
                onChange={(e) => handleFilterChange('deliveryDate', { ...filters.deliveryDate, from: e.target.value })}
              />
              <Input
                type="date"
                placeholder="To"
                value={filters.deliveryDate.to}
                onChange={(e) => handleFilterChange('deliveryDate', { ...filters.deliveryDate, to: e.target.value })}
              />
            </div>
          </div>

          {/* Publication Date Range */}
          <div>
            <label className="block text-sm font-medium mb-1">Publication Date</label>
            <div className="space-y-2">
              <Input
                type="date"
                placeholder="From"
                value={filters.publicationDate.from}
                onChange={(e) => handleFilterChange('publicationDate', { ...filters.publicationDate, from: e.target.value })}
              />
              <Input
                type="date"
                placeholder="To"
                value={filters.publicationDate.to}
                onChange={(e) => handleFilterChange('publicationDate', { ...filters.publicationDate, to: e.target.value })}
              />
            </div>
          </div>

          {/* Project Filter */}
          <div>
            <label className="block text-sm font-medium mb-1">Project</label>
            <select
              multiple
              className="w-full p-2 border rounded"
              value={filters.project}
              onChange={(e) => handleFilterChange('project', Array.from(e.target.selectedOptions, option => option.value))}
            >
              {options.projects.map((project) => (
                <option key={project.id} value={project.value}>
                  {project.label}
                </option>
              ))}
            </select>
          </div>

          {/* Content Type Filter */}
          <div>
            <label className="block text-sm font-medium mb-1">Content Type</label>
            <select
              multiple
              className="w-full p-2 border rounded"
              value={filters.contentType}
              onChange={(e) => handleFilterChange('contentType', Array.from(e.target.selectedOptions, option => option.value))}
            >
              {options.contentTypes.map((type) => (
                <option key={type.id} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          {/* Production Type Filter */}
          <div>
            <label className="block text-sm font-medium mb-1">Production Type</label>
            <select
              multiple
              className="w-full p-2 border rounded"
              value={filters.productionType}
              onChange={(e) => handleFilterChange('productionType', Array.from(e.target.selectedOptions, option => option.value))}
            >
              {options.productionTypes.map((type) => (
                <option key={type.id} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          {/* Language Filter */}
          <div>
            <label className="block text-sm font-medium mb-1">Language</label>
            <select
              multiple
              className="w-full p-2 border rounded"
              value={filters.language}
              onChange={(e) => handleFilterChange('language', Array.from(e.target.selectedOptions, option => option.value))}
            >
              {options.languages.map((lang) => (
                <option key={lang.id} value={lang.value}>
                  {lang.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
} 