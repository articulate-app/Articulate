"use client";
import TasksPageClient from '../TasksPageClient';
import { useParams } from 'next/navigation';
import { useEffect } from 'react';
import { useTasksUI } from '../../store/tasks-ui';

export default function TasksCatchAll() {
  const params = useParams();
  const slug = params?.slug as string[] | undefined;
  const setSelectedTaskId = useTasksUI(s => s.setSelectedTaskId);

  useEffect(() => {
    // If the first slug segment is a number, treat it as a task id
    if (slug && slug.length === 1 && /^\d+$/.test(slug[0])) {
      setSelectedTaskId(slug[0]);
    } else {
      setSelectedTaskId(null);
    }
  }, [slug, setSelectedTaskId]);

  return <TasksPageClient />;
} 