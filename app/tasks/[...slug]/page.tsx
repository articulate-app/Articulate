"use client";
import TasksPageClient from '../TasksPageClient';
import { useParams, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { useTasksUI } from '../../store/tasks-ui';

export default function TasksCatchAll() {
  const params = useParams();
  const slug = params?.slug as string[] | undefined;
  const searchParams = useSearchParams()
  const setSelectedTaskId = useTasksUI(s => s.setSelectedTaskId);

  useEffect(() => {
    // IMPORTANT: query param `id` is the single source of truth for selection.
    // The slug (/tasks/123) is only a fallback for deep links that don't include ?id=.
    const idFromQuery = searchParams.get('id')
    if (idFromQuery && idFromQuery.trim()) {
      setSelectedTaskId(idFromQuery)
      return
    }

    // If the first slug segment is a number, treat it as a task id (legacy deep link)
    if (slug && slug.length === 1 && /^\d+$/.test(slug[0])) {
      setSelectedTaskId(slug[0]);
      return
    }

    setSelectedTaskId(null);
  }, [slug, searchParams, setSelectedTaskId]);

  return <TasksPageClient />;
} 