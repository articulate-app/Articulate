import React, { useRef, useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

interface ResizableBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  initialHeight?: number; // fraction of viewport height (0-1)
  minHeight?: number; // fraction of viewport height (0-1)
  maxHeight?: number; // fraction of viewport height (0-1)
  /** When set, uses a fixed dynamic viewport height (e.g. 90 → 90dvh) instead of pixel math. */
  heightDvh?: number;
  /** Lock page scroll while the sheet is open. */
  lockBodyScroll?: boolean;
  /**
   * `auto` — scroll the sheet content wrapper (default, existing drawers).
   * `hidden` — fixed chrome + children scroll internally (create/add-task drawer).
   */
  contentOverflow?: "auto" | "hidden";
  title?: string;
  children: React.ReactNode;
}

function getViewportHeightPx(): number {
  if (typeof window === "undefined") return 0;
  return window.visualViewport?.height ?? window.innerHeight;
}

export function ResizableBottomSheet({
  isOpen,
  onClose,
  initialHeight = 0.7,
  minHeight = 0.4,
  maxHeight = 0.95,
  heightDvh,
  lockBodyScroll = true,
  contentOverflow = "auto",
  title,
  children,
}: ResizableBottomSheetProps) {
  const useFixedDvh = heightDvh != null;
  const [height, setHeight] = useState(() => getViewportHeightPx() * initialHeight);
  const [isDragging, setIsDragging] = useState(false);
  const startY = useRef(0);
  const startHeight = useRef(0);

  // Clamp height to min/max
  const clampHeight = useCallback(
    (h: number) => {
      const viewport = getViewportHeightPx();
      const min = viewport * minHeight;
      const max = viewport * maxHeight;
      return Math.max(min, Math.min(max, h));
    },
    [minHeight, maxHeight]
  );

  // Update height on open / viewport resize (fraction mode only)
  useEffect(() => {
    if (useFixedDvh || !isOpen) return;
    const syncHeight = () => setHeight(getViewportHeightPx() * initialHeight);
    syncHeight();
    window.visualViewport?.addEventListener("resize", syncHeight);
    return () => window.visualViewport?.removeEventListener("resize", syncHeight);
  }, [isOpen, initialHeight, useFixedDvh]);

  useEffect(() => {
    if (!isOpen || !lockBodyScroll) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, lockBodyScroll]);

  useEffect(() => {
    if (!isDragging || useFixedDvh) return;
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
  }, [isDragging, clampHeight, useFixedDvh]);

  if (!isOpen) return null;

  const sheetStyle = useFixedDvh
    ? { height: `${heightDvh}dvh`, maxHeight: `${heightDvh}dvh` }
    : { height, maxHeight: `${maxHeight * 100}vh` };

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
          "fixed left-0 right-0 bottom-0 z-50 flex flex-col rounded-t-2xl bg-white shadow-xl transition-all",
          "pb-[env(safe-area-inset-bottom)]",
          isDragging ? "select-none" : ""
        )}
        style={sheetStyle}
      >
        {/* Drag Handle — hidden for fixed dvh sheets (tall create drawer) */}
        {!useFixedDvh ? (
          <div
            className="flex flex-col items-center cursor-row-resize py-2 shrink-0"
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
        ) : (
          <div className="flex shrink-0 justify-center py-2" aria-hidden>
            <div className="h-1.5 w-10 rounded-full bg-gray-300" />
          </div>
        )}
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b px-4 py-2">
          <h2 className="truncate text-base font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="ml-2 rounded-full p-1 hover:bg-gray-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {/* Content */}
        <div
          className={cn(
            "min-h-0 flex-1",
            contentOverflow === "hidden"
              ? "flex flex-col overflow-hidden"
              : "overflow-y-auto",
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
