import React, { Suspense } from 'react';

interface EntityDetailsPageProps {
  entityType: string;
  id: string;
  fetcher: (id: string) => Promise<any>;
  DetailsComponent: React.ComponentType<{ selectedTask?: any }>;
}

export default async function EntityDetailsPage({ entityType, id, fetcher, DetailsComponent }: EntityDetailsPageProps) {
  let entity = null;
  let error = null;
  try {
    entity = await fetcher(id);
  } catch (e: any) {
    error = e;
  }

  if (error) {
    return <div className="p-8 text-red-500">Error loading {entityType}: {error.message}</div>;
  }
  if (!entity) {
    return <div className="p-8 text-gray-500">{entityType.charAt(0).toUpperCase() + entityType.slice(1)} not found.</div>;
  }
  return (
    <Suspense fallback={<div className="p-8 text-gray-400">Loading {entityType}...</div>}>
      <DetailsComponent selectedTask={entity} />
    </Suspense>
  );
} 