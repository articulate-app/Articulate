"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useTaskComposerStore } from "@/store/task-composer-store";

export const dynamic = "force-dynamic";

/**
 * /tasks/add route: redirect to /tasks and open the non-blocking composer.
 * The composer tray is rendered in the tasks layout.
 */
export default function AddTaskModal() {
  const router = useRouter();
  const openComposer = useTaskComposerStore((s) => s.openComposer);

  useEffect(() => {
    openComposer();
    router.replace("/tasks");
  }, [router, openComposer]);

  return null;
}
