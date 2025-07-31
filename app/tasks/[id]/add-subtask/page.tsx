'use client'

import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { AddTaskForm } from '../../../components/tasks/AddTaskForm';
import { useEffect, useState } from 'react';
import { getTaskById } from '../../../../lib/services/tasks';
import type { Task as BaseTask } from '../../../lib/types/tasks';

export default function AddSubtaskPage() {
  const router = useRouter();
  const params = useParams();
  const parentTaskId = params?.id ? String(params.id) : undefined;
  const [parentTask, setParentTask] = useState<BaseTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!parentTaskId) return;
    setLoading(true);
    const controller = new AbortController();
    getTaskById({ signal: controller.signal, id: parentTaskId })
      .then((task: any) => {
        setParentTask(task);
        setLoading(false);
      })
      .catch((err: any) => {
        setError('Parent task not found');
        setLoading(false);
      });
    return () => controller.abort();
  }, [parentTaskId]);

  if (!parentTaskId) {
    return <div className="p-8">Invalid parent task ID.</div>;
  }
  if (loading) {
    return <div className="p-8">Loading parent task...</div>;
  }
  if (error || !parentTask) {
    return <div className="p-8 text-red-500">{error || 'Parent task not found.'}</div>;
  }

  // Discrete message to show below the form title
  const subtaskMessage = (
    <div className="text-xs text-muted-foreground mb-2 text-center">
      Adding subtask to: <span className="font-medium">{parentTask.title}</span>
    </div>
  );

  return (
    <AddTaskForm
      parentTaskId={parentTaskId}
      defaultProjectId={parentTask.project_id_int ?? undefined}
      parentTaskTitle={parentTask.title}
      parentProjectName={(parentTask as any).project_name || ''}
      parentProjectId={parentTask.project_id_int ?? undefined}
      onClose={() => {
        const paramsStr = searchParams.toString();
        const url = paramsStr ? `/tasks/${parentTaskId}?${paramsStr}` : `/tasks/${parentTaskId}`;
        router.push(url);
      }}
      onSuccess={() => {
        const paramsStr = searchParams.toString();
        const url = paramsStr ? `/tasks/${parentTaskId}?${paramsStr}` : `/tasks/${parentTaskId}`;
        router.push(url);
      }}
    >
      {subtaskMessage}
    </AddTaskForm>
  );
} 