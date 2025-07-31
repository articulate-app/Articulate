import React, { useRef, useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

interface ResizableBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  initialHeight?: number; // fraction of viewport height (0-1)
  minHeight?: number; // fraction of viewport height (0-1)
  maxHeight?: number; // fraction of viewport height (0-1)
  title?: string;
  children: React.ReactNode;
}

export function ResizableBottomSheet({
  isOpen,
  onClose,
  initialHeight = 0.7,
  minHeight = 0.4,
  maxHeight = 0.95,
  title,
  children,
}: ResizableBottomSheetProps) {
  const [height, setHeight] = useState(() => window.innerHeight * initialHeight);
  const [isDragging, setIsDragging] = useState(false);
  const startY = useRef(0);
  const startHeight = useRef(0);

  // Clamp height to min/max
  const clampHeight = useCallback(
    (h: number) => {
      const min = window.innerHeight * minHeight;
      const max = window.innerHeight * maxHeight;
      return Math.max(min, Math.min(max, h));
    },
    [minHeight, maxHeight]
  );

  // Update height on window resize
  useEffect(() => {
    setHeight(window.innerHeight * initialHeight);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isDragging) return;
    const handleMove = (e: MouseEvent | TouchEvent) => {
      const clientY = "touches" in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
      const delta = startY.current - clientY;
      setHeight(clampHeight(startHeight.current + delta));
    };
    const handleUp = () => setIsDragging(false);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("touchmove", handleMove);
    window.addEventListener("mouseup", handleUp);
    window.addEventListener("touchend", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      window.removeEventListener("touchend", handleUp);
    };
  }, [isDragging, clampHeight]);

  if (!isOpen) return null;

  return (
    <div className="md:hidden">
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/40 transition-opacity"
        onClick={onClose}
      />
      {/* Bottom Sheet */}
      <div
        className={cn(
          "fixed left-0 right-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-xl flex flex-col transition-all",
          isDragging ? "select-none" : ""
        )}
        style={{ height, maxHeight: `95vh` }}
      >
        {/* Drag Handle */}
        <div
          className="flex flex-col items-center cursor-row-resize py-2"
          onMouseDown={e => {
            setIsDragging(true);
            startY.current = e.clientY;
            startHeight.current = height;
          }}
          onTouchStart={e => {
            setIsDragging(true);
            startY.current = e.touches[0].clientY;
            startHeight.current = height;
          }}
          role="separator"
          aria-orientation="vertical"
          tabIndex={0}
        >
          <div className="w-10 h-1.5 rounded-full bg-gray-300 mb-1" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b">
          <h2 className="text-base font-semibold truncate">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-full p-1 hover:bg-gray-100 ml-2"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
} 