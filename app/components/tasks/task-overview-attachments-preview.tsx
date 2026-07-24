"use client"

import React, { useMemo, useRef } from "react"
import { File, Loader2 } from "lucide-react"
import { useTaskAttachmentsUpload } from "@/hooks/use-task-attachments-upload"
import { TaskOverviewPreviewSection } from "./task-overview-preview-section"
import { useInViewport } from "@/hooks/use-in-viewport"
import { AddDashedButton } from "../ui/add-dashed-button"

const PREVIEW_ATTACHMENT_LIMIT = 4

type TaskOverviewAttachmentsPreviewProps = {
  taskId: number | string
  bootstrapAttachments: unknown[]
  onViewAll: () => void
  active?: boolean
}

export function TaskOverviewAttachmentsPreview({
  taskId,
  bootstrapAttachments,
  onViewAll,
  active = true,
}: TaskOverviewAttachmentsPreviewProps) {
  const { ref, isInViewport } = useInViewport({ enabled: active })
  const shouldLoad = active && isInViewport
  const fileInputRef = useRef<HTMLInputElement>(null)

  const attachmentsUpload = useTaskAttachmentsUpload({
    tableName: "tasks",
    recordId: taskId,
    bucketName: "attachments",
    seedFromBootstrap: true,
    bootstrapAttachments,
    enabled: shouldLoad,
  })

  const previewAttachments = useMemo(
    () => attachmentsUpload.attachments.slice(0, PREVIEW_ATTACHMENT_LIMIT),
    [attachmentsUpload.attachments],
  )

  const totalCount = attachmentsUpload.attachments.length
  const isEmpty = shouldLoad && totalCount === 0 && !attachmentsUpload.isUploading

  const openFilePicker = () => {
    fileInputRef.current?.click()
  }

  const handleFilesSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return
    void attachmentsUpload.uploadFiles(files)
    event.target.value = ""
  }

  return (
    <div ref={ref}>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFilesSelected}
      />
      <TaskOverviewPreviewSection
        title="Attachments"
        onViewAll={onViewAll}
        active={shouldLoad}
        isLoading={shouldLoad && attachmentsUpload.isUploading && totalCount === 0}
        isEmpty={isEmpty}
        emptyMessage="Add attachment"
        onEmptyClick={openFilePicker}
      >
        <ul className="space-y-1">
          {previewAttachments.map((att) => (
            <li key={att.id} className="flex items-center gap-2 py-1">
              <File size={16} className="shrink-0 text-muted-foreground" />
              <a
                href={attachmentsUpload.signedUrls[att.id]}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 truncate text-sm hover:underline"
                title={att.file_name}
                download
              >
                {att.file_name}
              </a>
            </li>
          ))}
        </ul>
        {totalCount > PREVIEW_ATTACHMENT_LIMIT ? (
          <p className="mt-1 text-xs text-gray-500">
            +{totalCount - PREVIEW_ATTACHMENT_LIMIT} more
          </p>
        ) : null}
        {attachmentsUpload.isUploading && totalCount > 0 ? (
          <div className="mt-1 flex items-center gap-1 text-xs text-gray-500">
            <Loader2 className="h-3 w-3 animate-spin" />
            Uploading…
          </div>
        ) : null}
        {attachmentsUpload.uploadError ? (
          <p className="mt-1 text-xs text-red-600">{attachmentsUpload.uploadError}</p>
        ) : null}
        <AddDashedButton
          label="Add attachment"
          className="mt-2"
          onClick={openFilePicker}
          disabled={attachmentsUpload.isUploading}
        />
      </TaskOverviewPreviewSection>
    </div>
  )
}
