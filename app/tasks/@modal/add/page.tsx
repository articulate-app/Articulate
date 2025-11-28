"use client";
import { useRouter } from "next/navigation";

// Disable static generation for this page
export const dynamic = 'force-dynamic';
import { AddTaskForm } from "../../../components/tasks/AddTaskForm";
import { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ResizableBottomSheet } from '../../../components/ui/resizable-bottom-sheet';

export default function AddTaskModal() {
  const router = useRouter();
  const modalRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | string>('100vw');
  const [maxWidth, setMaxWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth - 256 : 1200);
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setMounted(true);
    function handleResize() {
      setMaxWidth(window.innerWidth - 256);
      if (window.innerWidth < 768) {
        setWidth('100vw');
        setIsMobile(true);
      } else {
        setWidth(Math.min(800, window.innerWidth - 256));
        setIsMobile(false);
      }
    }
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  function onMouseDown(e: React.MouseEvent) {
    if (window.innerWidth < 768) return;
    e.preventDefault();
    function onMouseMove(ev: MouseEvent) {
      const minWidth = 700;
      const maxW = window.innerWidth - 256;
      let newWidth = window.innerWidth - ev.clientX;
      newWidth = Math.max(minWidth, Math.min(newWidth, maxW));
      setWidth(newWidth);
    }
    function onMouseUp() {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  if (!mounted) return null;

  if (isMobile) {
    return createPortal(
      <ResizableBottomSheet
        isOpen={true}
        onClose={() => router.back()}
        initialHeight={0.7}
        minHeight={0.4}
        maxHeight={0.95}
        title="Add Task"
      >
        <div className="h-full overflow-y-auto">
          <AddTaskForm onSuccess={() => router.back()} onClose={() => router.back()} isModal={true} />
        </div>
      </ResizableBottomSheet>,
      document.body
    );
  }

  // Desktop: right panel with resizer
  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/40 overflow-y-auto">
      <div
        ref={modalRef}
        className="fixed top-0 bottom-0 right-0 bg-white shadow-xl flex flex-col"
        style={{ width, boxSizing: 'border-box', minWidth: 700, maxWidth }}
      >
        {/* Left-edge resize area (desktop only) */}
        <div
          className="hidden md:block absolute left-0 top-0 h-full w-2 z-30 cursor-ew-resize"
          style={{ userSelect: 'none' }}
          onMouseDown={onMouseDown}
        />
        
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white py-4 px-6 flex items-center justify-between border-b">
          <h2 className="text-lg font-semibold">Add Task</h2>
          <button
            className="text-gray-500 hover:text-black text-2xl font-bold"
            onClick={() => router.back()}
            aria-label="Close"
            type="button"
          >
            ×
          </button>
        </div>
        
        {/* Content with scroll */}
        <div className="flex-1 overflow-y-auto">
          <AddTaskForm onSuccess={() => router.back()} onClose={() => router.back()} isModal={true} />
        </div>
      </div>
    </div>,
    document.body
  );
} 