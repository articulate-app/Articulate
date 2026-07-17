"use client";

import * as React from "react";
import {
  RichTextEditor as TiptapRichTextEditor,
  type AIAction,
} from "@/components/editor";
import type { Editor } from "@tiptap/react";

interface LegacyRichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  height?: number | string;
  toolbarId?: string;
  onAttachmentClick?: () => void;
  renderSendButton?: () => React.ReactNode;
  onFocus?: () => void;
  onBlur?: () => void;
  fontSize?: number | string;
  editorWrapperClassName?: string;
  editorClassName?: string;
  toolbarMode?: "docked" | "floating";
  inputFormat?: "auto" | "html" | "markdown";
  autoGrow?: boolean;
  onAiActionClick?: () => void;
  /** Attach the current selection to the AI chat composer (fixed toolbar button). */
  onAskAi?: () => void;
  highlightTerms?: Array<{ term: string; color: string }>;
  onCommentAction?: (selection: {
    start: number;
    end: number;
    text: string;
    anchorLeft: number;
    anchorTop: number;
  }) => void;
  commentHighlights?: Array<{
    id: number | string;
    start: number;
    end: number;
    color?: string;
    preview?: {
      authorName?: string | null;
      authorPhoto?: string | null;
      createdAt?: string | null;
      text?: string | null;
    };
  }>;
  showCommentHighlights?: boolean;
  onCommentHighlightClick?: (id: number | string) => void;
  toolbarVariant?: "full" | "compact";
  toolbarVisibility?: "always" | "focus" | "hidden";
  reserveToolbarSpace?: boolean;
  showBubbleToolbar?: boolean;
  onEditorFocus?: (editor: Editor) => void;
  onInsertAttachment?: (
    file: File,
    context?: { position?: number; currentHtml?: string }
  ) => Promise<{ attachmentId: string; url: string; mediaType: "image" | "video"; fileName: string } | null>;
  onInlineAttachmentClick?: (
    attachmentId: string,
    context?: { clientX: number; clientY: number; anchorX: number | null; anchorY: number | null }
  ) => void;
  onInlineAttachmentAction?: (
    attachmentId: string,
    action: "remove" | "shrink" | "grow"
  ) => void;
  onInlineAttachmentResize?: (attachmentId: string, widthPct: number) => void;
  flatSurface?: boolean;
  disableInlineMediaControls?: boolean;
  /** When true, anchor clicks navigate instead of opening the link editor dialog. */
  enableOutputLinkNavigation?: boolean;
  /** Preserve AI pane when navigating app:// links from AI chat previews. */
  fromAiChat?: boolean;
}

function stripHtmlToText(html: string): string {
  if (!html) return "";
  if (typeof window === "undefined") return html.replace(/<[^>]+>/g, " ").trim();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  return doc.body.textContent ?? "";
}

export function RichTextEditor({
  value,
  onChange,
  readOnly,
  placeholder,
  height,
  onAttachmentClick,
  renderSendButton,
  onFocus,
  onBlur,
  editorWrapperClassName,
  editorClassName,
  autoGrow,
  onAiActionClick,
  onAskAi,
  onCommentAction,
  onCommentHighlightClick,
  toolbarVariant = "full",
  toolbarVisibility = "focus",
  reserveToolbarSpace = false,
  showBubbleToolbar = false,
  onEditorFocus,
  onInsertAttachment,
  onInlineAttachmentClick,
  onInlineAttachmentAction,
  onInlineAttachmentResize,
  flatSurface = false,
  disableInlineMediaControls = false,
  enableOutputLinkNavigation = false,
  fromAiChat = false,
}: LegacyRichTextEditorProps) {
  const wrapperRef = React.useRef<HTMLDivElement | null>(null);
  const lastKnownValueRef = React.useRef<string>(value ?? "");
  const [isFocused, setIsFocused] = React.useState(false);

  const handleAIAction = React.useCallback(
    async (_action: AIAction, selectedText: string) => {
      if (onAiActionClick) {
        onAiActionClick();
      }
      return selectedText;
    },
    [onAiActionClick]
  );

  const handleAddComment = React.useCallback(
    async (selectedText: string) => {
      if (onCommentAction) {
        const selection = typeof window !== "undefined" ? window.getSelection() : null;
        const hasRange = selection && selection.rangeCount > 0 && !selection.isCollapsed;
        const range = hasRange ? selection!.getRangeAt(0) : null;
        const rect = range?.getBoundingClientRect();
        onCommentAction({
          start: 0,
          end: selectedText.length,
          text: selectedText,
          anchorLeft: rect ? rect.left + rect.width / 2 : 0,
          anchorTop: rect ? rect.bottom + 8 : 0,
        });
      }
      return `c_${Date.now()}`;
    },
    [onCommentAction]
  );

  const handleChange = React.useCallback(
    (nextHtml: string) => {
      lastKnownValueRef.current = nextHtml;
      onChange(nextHtml);
    },
    [onChange]
  );

  const containerStyles = React.useMemo<React.CSSProperties>(() => {
    if (autoGrow) {
      if (flatSurface) {
        return { height: "auto" };
      }
      return {
        minHeight: typeof height === "number" ? `${height}px` : height,
      };
    }
    return {
      minHeight: typeof height === "number" ? `${height}px` : height,
      height: typeof height === "number" ? `${height}px` : height,
    };
  }, [autoGrow, flatSurface, height]);

  const showToolbar = React.useMemo(() => {
    if (toolbarVisibility === "hidden") return false;
    if (toolbarVisibility === "focus") return isFocused;
    return true;
  }, [isFocused, toolbarVisibility]);
  const shouldReserveToolbarSpace = toolbarVisibility === "focus" && reserveToolbarSpace;

  return (
    <div
      ref={wrapperRef}
      className={`relative flex min-h-0 flex-col ${flatSurface ? "overflow-visible" : "overflow-hidden"} ${readOnly ? "component-output-readonly" : ""}`}
      style={containerStyles}
    >
      <TiptapRichTextEditor
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        className={`flex flex-col ${autoGrow ? "h-auto" : "h-full min-h-0"} ${editorWrapperClassName ?? ""}`}
        editorClassName={editorClassName}
        onAIAction={onAiActionClick ? handleAIAction : undefined}
        onAddComment={onCommentAction ? handleAddComment : undefined}
        onAskAi={onAskAi}
        toolbarVariant={toolbarVariant}
        showToolbar={showToolbar || shouldReserveToolbarSpace}
        toolbarInteractive={showToolbar}
        showBubbleToolbar={showBubbleToolbar}
        onEditorFocus={(editor) => {
          setIsFocused(true);
          onFocus?.();
          onEditorFocus?.(editor);
        }}
        onEditorBlur={() => {
          requestAnimationFrame(() => {
            const stillInside = wrapperRef.current?.contains(document.activeElement) ?? false;
            if (!stillInside) {
              setIsFocused(false);
              onBlur?.();
            }
          });
        }}
        onInsertAttachment={onInsertAttachment}
        onAttachmentClick={onInlineAttachmentClick}
        onAttachmentAction={onInlineAttachmentAction}
        onAttachmentResize={onInlineAttachmentResize}
        flatSurface={flatSurface}
        disableInlineMediaControls={disableInlineMediaControls}
        readOnly={readOnly}
        enableOutputLinkNavigation={enableOutputLinkNavigation}
        fromAiChat={fromAiChat}
        onCommentClick={
          onCommentHighlightClick
            ? (id: string) => {
                onCommentHighlightClick(id);
              }
            : undefined
        }
      />
      {(onAttachmentClick || renderSendButton) && !readOnly ? (
        <div className="pointer-events-none absolute bottom-2 right-2 z-30 flex items-center gap-2">
          {onAttachmentClick ? (
            <button
              type="button"
              onClick={onAttachmentClick}
              className="pointer-events-auto inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background text-xs"
              aria-label="Attach file"
              title="Attach file"
            >
              +
            </button>
          ) : null}
          {renderSendButton ? (
            <div className="pointer-events-auto">{renderSendButton()}</div>
          ) : null}
        </div>
      ) : null}
      {readOnly ? (
        <input type="hidden" value={stripHtmlToText(lastKnownValueRef.current)} readOnly />
      ) : null}
    </div>
  );
}

export default RichTextEditor;
