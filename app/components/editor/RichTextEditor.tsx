import * as React from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { Node, mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { CommentMark } from "./CommentMark";
import { EditorToolbar } from "./EditorToolbar";
import { CompactToolbar } from "./CompactToolbar";
import { BubbleToolbar } from "./BubbleToolbar";
import type { AIAction } from "./AIMenu";
import { cn } from "@/lib/utils";
import { openEditorLinkFromAnchor } from "./editor-link-commands";
import { useEditorLinkDialog } from "./useEditorLinkDialog";
import { usePathname } from "next/navigation";
import { handleComponentOutputAnchorClick } from "@/lib/component-output-link-navigation";

function isDebugOutputImageOverlaysEnabled(): boolean {
  // Temporary hard-on switch for safe CSS-only visual debugging.
  const FORCE_DEBUG_OUTPUT_IMAGE_OVERLAYS = true;
  if (FORCE_DEBUG_OUTPUT_IMAGE_OVERLAYS) return true;
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem("debugOutputImageOverlays") === "1";
  } catch {
    return false;
  }
}

const AttachmentBlock = Node.create({
  name: "attachmentBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,
  defining: true,
  addOptions() {
    return {
      disableInlineMediaControls: false,
    };
  },
  addAttributes() {
    return {
      attachmentId: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-attachment-id") ?? "",
        renderHTML: (attributes) => ({ "data-attachment-id": attributes.attachmentId }),
      },
      mediaType: {
        default: "image",
        parseHTML: (element) =>
          element.getAttribute("data-media-type") === "video" ? "video" : "image",
        renderHTML: (attributes) => ({ "data-media-type": attributes.mediaType }),
      },
      src: {
        default: "",
        parseHTML: (element) => {
          const media =
            element.querySelector("img") ??
            element.querySelector("video");
          return media?.getAttribute("src") ?? "";
        },
      },
      fileName: {
        default: "",
        parseHTML: (element) => {
          const img = element.querySelector("img");
          return (
            img?.getAttribute("alt") ??
            element.getAttribute("data-file-name") ??
            ""
          );
        },
      },
      widthPct: {
        default: 100,
        parseHTML: (element) => {
          const fromData = Number(element.getAttribute("data-width-pct"));
          if (Number.isFinite(fromData)) return Math.max(20, Math.min(100, fromData));
          const styleWidth = (element as HTMLElement).style?.width ?? "";
          const widthMatch = styleWidth.match(/^(\d+(?:\.\d+)?)%$/);
          const fromStyle = widthMatch ? Number(widthMatch[1]) : Number.NaN;
          return Number.isFinite(fromStyle) ? Math.max(20, Math.min(100, fromStyle)) : 100;
        },
        renderHTML: (attributes) => ({
          "data-width-pct": String(attributes.widthPct ?? 100),
        }),
      },
      commentPins: {
        default: "[]",
        parseHTML: (element) => element.getAttribute("data-comment-pins") ?? "[]",
        renderHTML: (attributes) => ({
          "data-comment-pins": typeof attributes.commentPins === "string" ? attributes.commentPins : "[]",
        }),
      },
      activeThreadId: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-active-thread-id") ?? "",
        renderHTML: (attributes) =>
          attributes.activeThreadId != null && String(attributes.activeThreadId).length > 0
            ? { "data-active-thread-id": String(attributes.activeThreadId) }
            : {},
      },
      pendingPin: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-pending-pin") ?? "",
        renderHTML: (attributes) =>
          attributes.pendingPin
            ? { "data-pending-pin": String(attributes.pendingPin) }
            : {},
      },
      commentCount: {
        default: 0,
        parseHTML: (element) => {
          const value = Number(element.getAttribute("data-comment-count"));
          return Number.isFinite(value) ? Math.max(0, value) : 0;
        },
        renderHTML: (attributes) => ({
          "data-comment-count": String(attributes.commentCount ?? 0),
        }),
      },
      editableSelected: {
        default: false,
        parseHTML: (element) => element.getAttribute("data-editable-selected") === "true",
        renderHTML: (attributes) => ({
          "data-editable-selected": attributes.editableSelected ? "true" : "false",
        }),
      },
      outputMode: {
        default: "display",
        parseHTML: (element) => element.getAttribute("data-output-mode") ?? "display",
        renderHTML: (attributes) => ({
          "data-output-mode": String(attributes.outputMode ?? "display"),
        }),
      },
      outputId: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-output-id") ?? "",
        renderHTML: (attributes) =>
          attributes.outputId && String(attributes.outputId).length > 0
            ? { "data-output-id": String(attributes.outputId) }
            : {},
      },
      debugOutputImageOverlays: {
        default: "false",
        parseHTML: (element) => element.getAttribute("data-debug-output-image-overlays") ?? "false",
        renderHTML: (attributes) => ({
          "data-debug-output-image-overlays":
            String(attributes.debugOutputImageOverlays ?? "false") === "true" ? "true" : "false",
        }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "figure[data-attachment-id]" }];
  },
  renderHTML({ HTMLAttributes }) {
    const attachmentIdAttr =
      (typeof HTMLAttributes.attachmentId === "string" && HTMLAttributes.attachmentId.length > 0
        ? HTMLAttributes.attachmentId
        : "") ||
      (typeof HTMLAttributes["data-attachment-id"] === "string" && HTMLAttributes["data-attachment-id"].length > 0
        ? HTMLAttributes["data-attachment-id"]
        : "");
    const widthPctRaw = Number(HTMLAttributes.widthPct);
    const widthPct = Number.isFinite(widthPctRaw) ? Math.max(20, Math.min(100, widthPctRaw)) : 100;
    const mediaType = HTMLAttributes.mediaType === "video" ? "video" : "image";
    const outputModeRaw =
      typeof HTMLAttributes.outputMode === "string"
        ? HTMLAttributes.outputMode
        : typeof HTMLAttributes["data-output-mode"] === "string"
          ? HTMLAttributes["data-output-mode"]
          : "display";
    const outputMode = outputModeRaw === "edit" || outputModeRaw === "focus" ? outputModeRaw : "display";
    const outputId =
      (typeof HTMLAttributes.outputId === "string" && HTMLAttributes.outputId.length > 0
        ? HTMLAttributes.outputId
        : "") ||
      (typeof HTMLAttributes["data-output-id"] === "string" && HTMLAttributes["data-output-id"].length > 0
        ? HTMLAttributes["data-output-id"]
        : "");
    const debugFromAttr = String(HTMLAttributes.debugOutputImageOverlays ?? "false") === "true";
    const debugOutputImageOverlays = debugFromAttr || isDebugOutputImageOverlaysEnabled();
    let parsedPins: Array<{ threadId: number; anchorX: number; anchorY: number }> = [];
    try {
      const encoded = typeof HTMLAttributes.commentPins === "string" ? HTMLAttributes.commentPins : "[]";
      const maybeDecoded = decodeURIComponent(encoded);
      const raw = JSON.parse(maybeDecoded);
      if (Array.isArray(raw)) {
        parsedPins = raw
          .map((item: any) => ({
            threadId: Number(item?.threadId),
            anchorX: Number(item?.anchorX),
            anchorY: Number(item?.anchorY),
          }))
          .filter((item) => Number.isFinite(item.threadId) && Number.isFinite(item.anchorX) && Number.isFinite(item.anchorY));
      }
    } catch {
      try {
        const fallbackRaw = JSON.parse(typeof HTMLAttributes.commentPins === "string" ? HTMLAttributes.commentPins : "[]");
        if (Array.isArray(fallbackRaw)) {
          parsedPins = fallbackRaw
            .map((item: any) => ({
              threadId: Number(item?.threadId),
              anchorX: Number(item?.anchorX),
              anchorY: Number(item?.anchorY),
            }))
            .filter((item) => Number.isFinite(item.threadId) && Number.isFinite(item.anchorX) && Number.isFinite(item.anchorY));
        }
      } catch {
        parsedPins = [];
      }
    }
    const activeThreadIdRaw = Number(HTMLAttributes.activeThreadId);
    const activeThreadId = Number.isFinite(activeThreadIdRaw) ? activeThreadIdRaw : null;
    const imagePins = parsedPins.map((pin) => {
      const left = Math.max(0, Math.min(100, pin.anchorX * 100));
      const top = Math.max(0, Math.min(100, pin.anchorY * 100));
      const isActive = activeThreadId != null && Number(pin.threadId) === Number(activeThreadId);
      return [
        "button",
        {
          type: "button",
          "data-comment-id": String(pin.threadId),
          "data-output-image-pin": "true",
          "data-thread-id": String(pin.threadId),
          contenteditable: "false",
          style:
            `position:absolute;left:${left}%;top:${top}%;transform:translate(-50%,-50%);width:14px;height:14px;border-radius:999px;border:2px solid #ffffff;background:#facc15;box-shadow:${isActive ? "0 0 0 4px rgba(253,224,71,0.55),0 2px 6px rgba(0,0,0,0.28)" : "0 2px 6px rgba(0,0,0,0.24)"};z-index:30;cursor:pointer;${isActive ? "animation:comment-pin-pulse 1.2s ease-in-out infinite;" : ""}`,
        },
      ];
    });
    const pendingPinRaw = typeof HTMLAttributes.pendingPin === "string" ? HTMLAttributes.pendingPin : "";
    const pendingPinParts = pendingPinRaw.split(",").map((value: string) => Number(value));
    const hasPendingPin =
      pendingPinParts.length === 2 &&
      Number.isFinite(pendingPinParts[0]) &&
      Number.isFinite(pendingPinParts[1]);
    const pendingPin = hasPendingPin
      ? [
          "span",
          {
            contenteditable: "false",
            style: `position:absolute;left:${Math.max(0, Math.min(100, pendingPinParts[0] * 100))}%;top:${Math.max(0, Math.min(100, pendingPinParts[1] * 100))}%;transform:translate(-50%,-50%);width:14px;height:14px;border-radius:999px;border:2px solid #ffffff;background:#f59e0b;box-shadow:0 0 0 3px rgba(253,224,71,0.45),0 2px 6px rgba(0,0,0,0.2);z-index:3;`,
          },
        ]
      : null;
    const commentCount = Number(HTMLAttributes.commentCount) || 0;
    const badge =
      commentCount > 0
        ? [
            "span",
            {
              contenteditable: "false",
              "data-output-comment-badge": "true",
              style:
                "position:absolute;top:8px;right:8px;background:#2563eb;color:#fff;border-radius:999px;padding:2px 8px;font-size:11px;line-height:1;z-index:4;",
            },
            String(commentCount),
          ]
        : null;
    const editableSelected = HTMLAttributes.editableSelected === true || HTMLAttributes.editableSelected === "true";
    const inlineMediaControlsDisabled = Boolean((this.options as any)?.disableInlineMediaControls);
    const canRenderEditControls =
      !inlineMediaControlsDisabled &&
      mediaType === "image" &&
      (outputMode === "edit" || outputMode === "focus" || debugOutputImageOverlays);
    const showEditControlsAlways =
      canRenderEditControls && (editableSelected || debugOutputImageOverlays);
    const controlsDefaultStyle =
      showEditControlsAlways
        ? "opacity:1;pointer-events:auto;"
        : "opacity:0;pointer-events:none;";
    const removeControl =
      canRenderEditControls
        ? [
            "button",
            {
              type: "button",
              "data-output-image-remove": "true",
              "data-attachment-id": attachmentIdAttr,
              "data-output-id": outputId,
              "data-output-mode": outputMode,
              "data-attachment-action": "remove",
              contenteditable: "false",
              style:
                `position:absolute;right:8px;top:8px;z-index:9999;height:40px;min-width:40px;border-radius:999px;outline:4px solid #ffffff;border:1px solid rgba(255,255,255,0.5);background:#dc2626;color:#ffffff;font-size:22px;font-weight:700;line-height:1;display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer;pointer-events:auto;box-shadow:0 8px 22px rgba(0,0,0,0.35);transition:opacity 120ms ease;${controlsDefaultStyle}`,
            },
            "×",
          ]
        : null;
    const resizeControl =
      canRenderEditControls
        ? [
            "div",
            {
              "data-output-image-resize-handle": "true",
              "data-attachment-id": attachmentIdAttr,
              "data-attachment-resize-handle": "true",
              contenteditable: "false",
              style:
                `position:absolute;right:6px;bottom:6px;z-index:40;height:18px;width:18px;border-radius:4px;border:1px solid rgba(255,255,255,0.65);background:rgba(0,0,0,0.75);box-shadow:0 1px 4px rgba(0,0,0,0.16);cursor:nwse-resize;transition:opacity 120ms ease;${controlsDefaultStyle}`,
            },
          ]
        : null;
    const noPinsBadge =
      debugOutputImageOverlays && mediaType === "image" && imagePins.length === 0
        ? [
            "span",
            {
              contenteditable: "false",
              style:
                "position:absolute;left:8px;bottom:8px;border-radius:999px;background:rgba(107,114,128,0.88);color:#fff;padding:2px 8px;font-size:10px;line-height:1;z-index:36;",
            },
            "No pins for this image",
          ]
        : null;
    const debugLabel =
      debugOutputImageOverlays && mediaType === "image"
        ? [
            "span",
            {
              contenteditable: "false",
              style:
                "position:absolute;left:8px;top:8px;border-radius:6px;background:rgba(0,0,0,0.75);color:#fff;padding:2px 6px;font-size:10px;line-height:1.2;z-index:35;white-space:nowrap;",
            },
            `img ${(String(attachmentIdAttr).slice(0, 8) || "unknown")} · pins ${imagePins.length} · ${outputMode} · selected ${editableSelected ? "true" : "false"} · width ${Math.round(widthPct)}%`,
          ]
        : null;
    const debugOverlayBounds =
      debugOutputImageOverlays && mediaType === "image"
        ? [
            "span",
            {
              contenteditable: "false",
              style: "position:absolute;inset:0;border:2px dashed rgba(239,68,68,0.85);pointer-events:none;z-index:32;border-radius:8px;",
            },
          ]
        : null;
    const src = typeof HTMLAttributes.src === "string" ? HTMLAttributes.src : "";
    const fileName = typeof HTMLAttributes.fileName === "string" ? HTMLAttributes.fileName : "";
    const mediaNode =
      mediaType === "video"
        ? [
            "video",
            {
              src,
              controls: "true",
              draggable: "false",
              ondragstart: "return false;",
              style: "max-width:100%;height:auto;display:block;border-radius:8px;",
            },
          ]
        : [
            "img",
            {
              src,
              alt: fileName,
              draggable: "false",
              ondragstart: "return false;",
              style: "display:block;height:auto;width:100%;max-width:100%;border-radius:8px;",
            },
          ];

    return [
      "figure",
      mergeAttributes(HTMLAttributes, {
        "data-output-image-wrapper": mediaType === "image" ? "true" : "false",
        contenteditable: "false",
        draggable: "false",
        ondragstart: "return false;",
        style: `margin:12px 0;position:relative;display:inline-block;vertical-align:top;overflow:visible;width:${widthPct}%;max-width:100%;${editableSelected ? "box-shadow:0 0 0 2px rgba(59,130,246,0.45);border-radius:10px;" : ""}${debugOutputImageOverlays && mediaType === "image" ? "outline:2px dashed rgba(239,68,68,0.9);" : ""}`,
      }),
      mediaNode,
      ...(debugOverlayBounds ? [debugOverlayBounds] : []),
      ...(badge ? [badge] : []),
      ...(debugLabel ? [debugLabel] : []),
      ...imagePins,
      ...(noPinsBadge ? [noPinsBadge] : []),
      ...(pendingPin ? [pendingPin] : []),
      ...(removeControl ? [removeControl] : []),
      ...(resizeControl ? [resizeControl] : []),
    ];
  },
});

export interface RichTextEditorProps {
  value?: string;
  onChange?: (html: string) => void;
  placeholder?: string;
  className?: string;
  editorClassName?: string;
  onAddComment?: (selectedText: string) => string | Promise<string>;
  onAIAction?: (action: AIAction, selectedText: string) => Promise<string> | string;
  /** Attach the current selection to the AI chat composer (fixed toolbar button). */
  onAskAi?: () => void;
  onCommentClick?: (id: string) => void;
  toolbarVariant?: "full" | "compact";
  showToolbar?: boolean;
  toolbarInteractive?: boolean;
  showBubbleToolbar?: boolean;
  onEditorFocus?: (editor: Editor) => void;
  onEditorBlur?: () => void;
  onInsertAttachment?: (
    file: File,
    context?: { position?: number; currentHtml?: string }
  ) => Promise<{ attachmentId: string; url: string; mediaType: "image" | "video"; fileName: string } | null>;
  onAttachmentClick?: (
    attachmentId: string,
    context?: {
      clientX: number;
      clientY: number;
      anchorX: number | null;
      anchorY: number | null;
    }
  ) => void;
  onAttachmentAction?: (
    attachmentId: string,
    action: "remove" | "shrink" | "grow"
  ) => void;
  onAttachmentResize?: (attachmentId: string, widthPct: number) => void;
  flatSurface?: boolean;
  disableInlineMediaControls?: boolean;
  readOnly?: boolean;
  enableOutputLinkNavigation?: boolean;
  fromAiChat?: boolean;
}

export const RichTextEditor: React.FC<RichTextEditorProps> = ({
  value,
  onChange,
  placeholder = "Start writing, or select text to use AI...",
  className,
  editorClassName,
  onAddComment,
  onAIAction: _onAIAction,
  onAskAi,
  onCommentClick,
  toolbarVariant = "full",
  showToolbar = true,
  toolbarInteractive = true,
  showBubbleToolbar = false,
  onEditorFocus,
  onEditorBlur,
  onInsertAttachment,
  onAttachmentClick,
  onAttachmentAction,
  onAttachmentResize,
  flatSurface = false,
  disableInlineMediaControls = false,
  readOnly = false,
  enableOutputLinkNavigation = false,
  fromAiChat = false,
}) => {
  const pathname = usePathname();
  const resolveElementTarget = React.useCallback((rawTarget: EventTarget | null): Element | null => {
    if (rawTarget instanceof Element) return rawTarget;
    if (rawTarget instanceof globalThis.Node) {
      const parent = rawTarget.parentNode;
      return parent instanceof Element ? parent : null;
    }
    return null;
  }, []);
  const imageInputRef = React.useRef<HTMLInputElement | null>(null);
  const videoInputRef = React.useRef<HTMLInputElement | null>(null);
  const isUploadingAttachmentRef = React.useRef(false);
  const resizingImageRef = React.useRef(false);
  const editorRootRef = React.useRef<HTMLDivElement | null>(null);
  const editorRef = React.useRef<Editor | null>(null);
  const openLinkDialogRef = React.useRef<(() => void) | null>(null);
  const handleLinkShortcutRef = React.useRef<((event: KeyboardEvent) => boolean) | null>(null);
  const enableOutputLinkNavigationRef = React.useRef(enableOutputLinkNavigation);
  const fromAiChatRef = React.useRef(fromAiChat);
  const pathnameRef = React.useRef(pathname);
  enableOutputLinkNavigationRef.current = enableOutputLinkNavigation;
  fromAiChatRef.current = fromAiChat;
  pathnameRef.current = pathname;
  const debugOutputImageOverlays = React.useMemo(() => isDebugOutputImageOverlaysEnabled(), []);
  const interceptAttachmentControlsCapture = React.useCallback(
    (event: React.SyntheticEvent) => {
      if (disableInlineMediaControls) return;
      const target = resolveElementTarget(event.target);
      if (!target) return;
      const removeControlEl = target.closest<HTMLElement>("[data-output-image-remove='true']");
      if (removeControlEl) {
        const attachmentId =
          removeControlEl.getAttribute("data-attachment-id")
          ?? removeControlEl.closest<HTMLElement>("[data-attachment-id]")?.getAttribute("data-attachment-id")
          ?? null;
        const mode = removeControlEl.getAttribute("data-output-mode") ?? "unknown";
        const outputId = removeControlEl.getAttribute("data-output-id")
          ?? removeControlEl.closest<HTMLElement>("[data-output-id]")?.getAttribute("data-output-id")
          ?? null;
        if (event.type === "pointerdown") {
          console.log("[image remove] pointer down on X", {
            outputId,
            attachmentId,
            mode,
            target: event.target,
            currentTarget: event.currentTarget,
          });
        }
        if (event.type === "click") {
          console.log("[image remove] click on X START", {
            outputId,
            attachmentId,
            mode,
            target: event.target,
            currentTarget: event.currentTarget,
          });
        }
        event.preventDefault();
        event.stopPropagation();
        if (event.type === "click" && (!outputId || !attachmentId)) {
          console.error("[image remove] missing required ids; refusing to remove", {
            outputId,
            attachmentId,
            mode,
          });
          return;
        }
        if (event.type === "click" && mode !== "edit") {
          console.warn("[image remove] click ignored because mode is not edit", {
            outputId,
            attachmentId,
            mode,
          });
          return;
        }
        if (event.type === "click" && attachmentId && onAttachmentAction) {
          onAttachmentAction(attachmentId, "remove");
          console.log("[image remove] click on X END", {
            outputId,
            attachmentId,
            mode,
          });
        }
        return;
      }
      const resizeControlEl = target.closest<HTMLElement>("[data-output-image-resize-handle='true']");
      if (resizeControlEl) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    [disableInlineMediaControls, resolveElementTarget, onAttachmentAction]
  );
  const insertAttachmentAt = React.useCallback(
    (
      localEditor: Editor,
      attachment: { attachmentId: string; url: string; mediaType: "image" | "video"; fileName: string },
      at?: number
    ) => {
      const block = [
        {
          type: "attachmentBlock",
          attrs: {
            attachmentId: attachment.attachmentId,
            mediaType: attachment.mediaType,
            src: attachment.url,
            fileName: attachment.fileName,
          },
        },
        { type: "paragraph" },
      ];
      if (typeof at === "number") {
        localEditor.chain().focus().insertContentAt(at, block).run();
      } else {
        localEditor.chain().focus().insertContent(block).run();
      }
    },
    []
  );

  const pickAndInsertAttachment = React.useCallback(
    async (file: File, localEditor: Editor | null | undefined, at?: number) => {
      if (isUploadingAttachmentRef.current) return;
      if (!onInsertAttachment) return;
      isUploadingAttachmentRef.current = true;
      try {
        const inserted = await onInsertAttachment(file, {
          position: at,
          currentHtml: localEditor?.getHTML() ?? "",
        });
        if (!inserted) return;
        const targetEditor = localEditor ?? null;
        if (!targetEditor) return;
        insertAttachmentAt(targetEditor, inserted, at);
      } finally {
        isUploadingAttachmentRef.current = false;
      }
    },
    [onInsertAttachment, insertAttachmentAt]
  );

  const editor = useEditor({
    editable: !readOnly,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      AttachmentBlock.configure({
        disableInlineMediaControls,
      }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true }),
      Placeholder.configure({ placeholder }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Highlight.configure({ multicolor: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      CommentMark,
    ],
    content: value ?? "",
    onUpdate: ({ editor: localEditor }) => onChange?.(localEditor.getHTML()),
    onFocus: ({ editor: localEditor }) => {
      onEditorFocus?.(localEditor);
    },
    onBlur: () => {
      onEditorBlur?.();
    },
    editorProps: {
      attributes: {
        class: cn(
          "rte-prose focus:outline-none",
          flatSurface
            ? "min-h-[5rem] h-auto px-3 py-2"
            : "min-h-[120px] h-full px-6 py-6",
          editorClassName
        ),
        "data-output-editor": "true",
      },
      handleClickOn: (_view, _pos, _node, _nPos, event) => {
        const target = resolveElementTarget(event.target);
        if (!target) return false;
        const anchor = target.closest<HTMLAnchorElement>("a[href]");
        if (anchor) {
          if (enableOutputLinkNavigationRef.current) {
            if (
              handleComponentOutputAnchorClick({
                event: event as unknown as React.MouseEvent<HTMLElement>,
                href: anchor.getAttribute("href"),
                pathname: pathnameRef.current,
                fromAiChat: fromAiChatRef.current,
              })
            ) {
              return true;
            }
          } else if (editorRef.current) {
            event.preventDefault();
            openEditorLinkFromAnchor(editorRef.current, anchor);
            openLinkDialogRef.current?.();
            return true;
          }
        }
        const removeControlEl = disableInlineMediaControls
          ? null
          : target.closest<HTMLElement>("[data-output-image-remove='true']");
        if (removeControlEl) {
          const attachmentId =
            removeControlEl.getAttribute("data-attachment-id")
            ?? removeControlEl.closest<HTMLElement>("[data-attachment-id]")?.getAttribute("data-attachment-id");
          if (attachmentId && onAttachmentAction) {
            onAttachmentAction(attachmentId, "remove");
          }
          // Never fall through to generic attachment click/comment open.
          return true;
        }
        const resizeControlEl = disableInlineMediaControls
          ? null
          : target.closest<HTMLElement>("[data-output-image-resize-handle='true']");
        if (resizeControlEl) {
          // Let pointerdown resize logic handle this; block click-through to comment open.
          return true;
        }
        const attachmentActionEl = disableInlineMediaControls
          ? null
          : target.closest<HTMLElement>("[data-attachment-action]");
        if (attachmentActionEl && onAttachmentAction) {
          const attachmentId =
            attachmentActionEl.getAttribute("data-attachment-id")
            ?? attachmentActionEl
              .closest<HTMLElement>("[data-attachment-id]")
              ?.getAttribute("data-attachment-id");
          const action = attachmentActionEl.getAttribute("data-attachment-action");
          if (
            attachmentId &&
            (action === "remove" || action === "shrink" || action === "grow")
          ) {
            onAttachmentAction(attachmentId, action);
            return true;
          }
        }
        const commentEl = target.closest<HTMLElement>("[data-comment-id]");
        if (commentEl && onCommentClick) {
          onCommentClick(commentEl.dataset.commentId!);
          return true;
        }
        const attachmentEl = target.closest<HTMLElement>("[data-attachment-id]");
        if (attachmentEl && onAttachmentClick) {
          if (resizingImageRef.current) return true;
          // Defensive guard: never open comment flow from overlay controls.
          if (
            target.closest("[data-output-image-remove='true']")
            || target.closest("[data-output-image-resize-handle='true']")
            || target.closest("[data-attachment-action]")
          ) {
            return true;
          }
          const attachmentId = attachmentEl.getAttribute("data-attachment-id");
          if (attachmentId) {
            const mediaEl =
              attachmentEl.querySelector("img") ??
              attachmentEl.querySelector("video");
            const rect = mediaEl?.getBoundingClientRect();
            const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
            const anchorX =
              rect && rect.width > 0 ? clamp01((event.clientX - rect.left) / rect.width) : null;
            const anchorY =
              rect && rect.height > 0 ? clamp01((event.clientY - rect.top) / rect.height) : null;
            onAttachmentClick(attachmentId, {
              clientX: event.clientX,
              clientY: event.clientY,
              anchorX,
              anchorY,
            });
            return true;
          }
        }
        return false;
      },
      handleDrop: (view, event) => {
        if (!onInsertAttachment) return false;
        if (resizingImageRef.current) {
          event.preventDefault();
          event.stopPropagation();
          return true;
        }
        event.preventDefault();
        event.stopPropagation();
        if (isUploadingAttachmentRef.current) return true;
        const files = Array.from(event.dataTransfer?.files ?? []);
        const media = files.find(
          (file) => file.type.toLowerCase().startsWith("image/") || file.type.toLowerCase().startsWith("video/")
        );
        if (!media) return false;
        const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
        void pickAndInsertAttachment(media, editor, coords?.pos);
        return true;
      },
      handleKeyDown: (view, event) => {
        if (handleLinkShortcutRef.current?.(event)) return true;
        if (!(event.key === "Backspace" || event.key === "Delete")) return false;
        if (!onAttachmentAction) return false;
        const selectionAny = view.state.selection as any;
        const selectedNode = selectionAny?.node;
        if (!selectedNode || selectedNode.type?.name !== "attachmentBlock") return false;
        const attachmentId = selectedNode.attrs?.attachmentId as string | undefined;
        if (!attachmentId) return false;
        console.log("[keyboard delete image] using blocks source", {
          selectedAttachmentId: attachmentId,
          key: event.key,
        });
        event.preventDefault();
        event.stopPropagation();
        onAttachmentAction(attachmentId, "remove");
        return true;
      },
      handleDOMEvents: {
        click: (_view, event) => {
          const mouseEvent = event as MouseEvent;
          const target = resolveElementTarget(mouseEvent.target);
          if (!target) return false;
          const removeControlEl = disableInlineMediaControls
            ? null
            : target.closest<HTMLElement>("[data-output-image-remove='true']");
          if (removeControlEl) {
            mouseEvent.preventDefault();
            mouseEvent.stopPropagation();
            const attachmentId =
              removeControlEl.getAttribute("data-attachment-id")
              ?? removeControlEl.closest<HTMLElement>("[data-attachment-id]")?.getAttribute("data-attachment-id");
            if (attachmentId && onAttachmentAction) {
              onAttachmentAction(attachmentId, "remove");
            }
            return true;
          }
          const resizeControlEl = disableInlineMediaControls
            ? null
            : target.closest<HTMLElement>("[data-output-image-resize-handle='true']");
          if (resizeControlEl) {
            mouseEvent.preventDefault();
            mouseEvent.stopPropagation();
            return true;
          }
          return false;
        },
        pointerdown: (_view, event) => {
          const pointerEvent = event as PointerEvent;
          const target = resolveElementTarget(pointerEvent.target);
          const removeControlEl = disableInlineMediaControls
            ? null
            : target?.closest<HTMLElement>("[data-output-image-remove='true']");
          if (removeControlEl) {
            pointerEvent.preventDefault();
            pointerEvent.stopPropagation();
            const attachmentId =
              removeControlEl.getAttribute("data-attachment-id")
              ?? removeControlEl.closest<HTMLElement>("[data-attachment-id]")?.getAttribute("data-attachment-id");
            if (attachmentId && onAttachmentAction) {
              onAttachmentAction(attachmentId, "remove");
            }
            return true;
          }
          if (disableInlineMediaControls || !onAttachmentResize) return false;
          const handle = target?.closest<HTMLElement>("[data-attachment-resize-handle='true']");
          if (!handle) return false;
          const attachmentEl = handle.closest<HTMLElement>("[data-attachment-id]");
          const attachmentId = attachmentEl?.getAttribute("data-attachment-id");
          if (!attachmentEl || !attachmentId) return false;
          resizingImageRef.current = true;
          pointerEvent.preventDefault();
          pointerEvent.stopPropagation();
          handle.setPointerCapture?.(pointerEvent.pointerId);
          const startX = pointerEvent.clientX;
          const wrapperWidthPx = Math.max(1, attachmentEl.getBoundingClientRect().width);
          const resizeContainer =
            attachmentEl.closest<HTMLElement>("[data-output-content-body='true']")
            ?? editorRootRef.current;
          const containerWidth = Math.max(1, resizeContainer?.getBoundingClientRect().width ?? 1);
          console.log("[image resize] start", {
            outputId: attachmentEl.getAttribute("data-output-id"),
            attachmentId,
            startX,
            startWidthPx: wrapperWidthPx,
            containerWidthPx: containerWidth,
          });
          const onMove = (moveEvent: PointerEvent) => {
            moveEvent.preventDefault();
            moveEvent.stopPropagation();
            const deltaX = moveEvent.clientX - startX;
            const nextWidthPx = wrapperWidthPx + deltaX;
            const nextPctRaw = (nextWidthPx / containerWidth) * 100;
            const nextPct = Math.max(20, Math.min(100, nextPctRaw));
            console.log("[image resize] move", {
              attachmentId,
              deltaPx: deltaX,
              nextPct,
            });
            onAttachmentResize(attachmentId, nextPct);
          };
          const onUp = (upEvent: PointerEvent) => {
            upEvent.preventDefault();
            upEvent.stopPropagation();
            resizingImageRef.current = false;
            handle.releasePointerCapture?.(pointerEvent.pointerId);
            console.log("[image resize] end", { attachmentId });
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
          };
          window.addEventListener("pointermove", onMove, { passive: false });
          window.addEventListener("pointerup", onUp, { passive: false });
          return true;
        },
        mousedown: (_view, event) => {
          const mouseEvent = event as MouseEvent;
          const target = resolveElementTarget(mouseEvent.target);
          const removeControlEl = disableInlineMediaControls
            ? null
            : target?.closest<HTMLElement>("[data-output-image-remove='true']");
          if (!removeControlEl) return false;
          mouseEvent.preventDefault();
          mouseEvent.stopPropagation();
          const attachmentId =
            removeControlEl.getAttribute("data-attachment-id")
            ?? removeControlEl.closest<HTMLElement>("[data-attachment-id]")?.getAttribute("data-attachment-id");
          if (attachmentId && onAttachmentAction) {
            onAttachmentAction(attachmentId, "remove");
          }
          return true;
        },
      },
    },
  });

  const { openLinkDialog, handleLinkShortcut, linkDialogNode } = useEditorLinkDialog(editor);
  editorRef.current = editor;
  openLinkDialogRef.current = openLinkDialog;
  handleLinkShortcutRef.current = handleLinkShortcut;

  React.useEffect(() => {
    if (!editor) return;
    // While the user is actively editing, TipTap owns document state. Replacing content from the
    // controlled value prop would reset selection to the end on every parent re-render.
    if (editor.isFocused) return;
    const current = editor.getHTML();
    const next = value ?? "";
    if (current === next) return;
    editor.commands.setContent(next, false);
  }, [editor, value]);

  return (
    <div
      ref={editorRootRef}
      data-debug-output-image-overlays={debugOutputImageOverlays ? "true" : "false"}
      className={cn(
        debugOutputImageOverlays && "debug-output-image-overlays",
        flatSurface
          ? "flex min-h-0 flex-col overflow-visible rounded-md border-0 bg-transparent shadow-none"
          : "flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm",
        className
      )}
    >
      {showToolbar ? (
        toolbarVariant === "compact" ? (
          <CompactToolbar
            editor={editor}
            onAddComment={onAddComment}
            onAskAi={onAskAi}
            onInsertImage={onInsertAttachment ? () => imageInputRef.current?.click() : undefined}
            onInsertVideo={onInsertAttachment ? () => videoInputRef.current?.click() : undefined}
            onLinkClick={openLinkDialog}
            className={cn(!toolbarInteractive && "pointer-events-none opacity-0 select-none")}
          />
        ) : (
          <EditorToolbar
            editor={editor}
            onAddComment={onAddComment}
            onInsertImage={onInsertAttachment ? () => imageInputRef.current?.click() : undefined}
            onInsertVideo={onInsertAttachment ? () => videoInputRef.current?.click() : undefined}
            onLinkClick={openLinkDialog}
            className={cn(!toolbarInteractive && "pointer-events-none opacity-0 select-none")}
          />
        )
      ) : null}
      {showBubbleToolbar ? (
        <BubbleToolbar editor={editor} onAddComment={onAddComment} onLinkClick={openLinkDialog} />
      ) : null}
      {onInsertAttachment ? (
        <>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              const cursorPos = editor?.state?.selection?.from;
              if (file) void pickAndInsertAttachment(file, editor, cursorPos);
              event.currentTarget.value = "";
            }}
          />
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              const cursorPos = editor?.state?.selection?.from;
              if (file) void pickAndInsertAttachment(file, editor, cursorPos);
              event.currentTarget.value = "";
            }}
          />
        </>
      ) : null}
      <EditorContent
        editor={editor}
        className={cn(
          flatSurface ? "h-auto shrink-0 overflow-visible" : "min-h-0 flex-1 overflow-y-auto",
        )}
        data-output-editor="true"
        onPointerDownCapture={interceptAttachmentControlsCapture}
        onClickCapture={interceptAttachmentControlsCapture}
        onDragEnter={(event) => {
          if (resizingImageRef.current) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          event.preventDefault();
          event.stopPropagation();
        }}
        onDragOver={(event) => {
          if (resizingImageRef.current) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          event.preventDefault();
          event.stopPropagation();
        }}
        onDrop={(event) => {
          if (resizingImageRef.current) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          if (isUploadingAttachmentRef.current) return;
          if (!onInsertAttachment || !editor) return;
          const files = Array.from(event.dataTransfer?.files ?? []);
          const media = files.find(
            (file) => file.type.toLowerCase().startsWith("image/") || file.type.toLowerCase().startsWith("video/")
          );
          if (!media) return;
          const coords = editor.view.posAtCoords({ left: event.clientX, top: event.clientY });
          void pickAndInsertAttachment(media, editor, coords?.pos);
        }}
      />
      {linkDialogNode}
    </div>
  );
};

export default RichTextEditor;
