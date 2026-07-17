"use client"

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { File, Loader2, Upload, X } from 'lucide-react'
import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react'

export interface DropzoneAttachment {
  id: string
  file_name: string
  file_path: string
  uploaded_at: string
  uploaded_by: string | null
  mime_type: string | null
  size: number | null
}

export interface DropzoneHandle {
  openFilePicker: () => void
}

interface DropzoneProps {
  tableName: string
  recordId: string | number
  bucketName?: string
  className?: string
  /** When true: no large drop area, no inner "Attachments" title; use with parent providing title + add button */
  minimal?: boolean
  onChange?: (attachments: DropzoneAttachment[]) => void
  attachments: DropzoneAttachment[]
  signedUrls: { [id: string]: string }
  isUploading: boolean
  uploadError: string | null
  uploadFiles: (files: FileList | File[]) => Promise<void>
  deleteAttachment: (attachment: DropzoneAttachment) => Promise<void>
  renderAttachmentActions?: (attachment: DropzoneAttachment) => React.ReactNode
}

export const Dropzone = forwardRef<DropzoneHandle, DropzoneProps>(function Dropzone({
  tableName,
  recordId,
  bucketName = 'task-files',
  className,
  minimal = false,
  onChange,
  attachments,
  signedUrls,
  isUploading,
  uploadError,
  uploadFiles,
  deleteAttachment,
  renderAttachmentActions,
}, ref) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragActive, setIsDragActive] = useState(false)

  useImperativeHandle(ref, () => ({
    openFilePicker: () => fileInputRef.current?.click(),
  }), [])

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragActive(false)
    if (e.dataTransfer.files.length > 0) {
      await uploadFiles(e.dataTransfer.files)
    }
  }

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      await uploadFiles(e.target.files)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const content = (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileInput}
      />
      {isUploading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="animate-spin" size={16} /> Uploading...
        </div>
      )}
      {uploadError && (
        <div className="text-sm text-destructive">{uploadError}</div>
      )}
      {attachments.length > 0 && (
        <ul className="space-y-2 mt-2">
          {attachments.map(att => (
            <li key={att.id} className="flex items-center gap-2 border-b border-gray-100 py-2">
              <File size={18} className="text-muted-foreground shrink-0" />
              <a
                href={signedUrls[att.id]}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate text-sm hover:underline min-w-0"
                title={att.file_name}
                download
              >
                {att.file_name}
              </a>
              <span className="text-xs text-muted-foreground shrink-0">{att.size ? `${(att.size / 1024).toFixed(1)} KB` : ''}</span>
              <Button
                size="icon"
                variant="ghost"
                className="ml-auto shrink-0 h-8 w-8"
                onClick={() => deleteAttachment(att)}
                disabled={isUploading}
                aria-label="Delete attachment"
              >
                <X size={16} />
              </Button>
              {renderAttachmentActions && renderAttachmentActions(att)}
            </li>
          ))}
        </ul>
      )}
    </>
  )

  if (minimal) {
    return (
      <div className={cn('min-w-0', className)}>
        {content}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'border-2 border-dashed rounded-lg p-4 bg-card transition-colors duration-300',
        isDragActive ? 'border-primary bg-primary/10' : 'border-gray-300',
        className
      )}
      onDragOver={e => {
        e.preventDefault()
        setIsDragActive(true)
      }}
      onDragLeave={e => {
        e.preventDefault()
        setIsDragActive(false)
      }}
      onDrop={handleDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileInput}
      />
      <div className="flex flex-col items-center gap-2">
        <Upload size={20} className="text-muted-foreground" />
        <p className="text-sm">Drag and drop files here, or <span className="underline cursor-pointer" onClick={() => fileInputRef.current?.click()}>select files</span> to upload</p>
        {isUploading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
            <Loader2 className="animate-spin" size={16} /> Uploading...
          </div>
        )}
        {uploadError && (
          <div className="text-sm text-destructive mt-2">{uploadError}</div>
        )}
      </div>
      {attachments.length > 0 && (
        <div className="mt-4">
          <div className="font-semibold text-sm mb-2">Attachments</div>
          <ul className="space-y-2">
            {attachments.map(att => (
              <li key={att.id} className="flex items-center gap-2 border-b py-2">
                <File size={18} className="text-muted-foreground" />
                <a
                  href={signedUrls[att.id]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate text-sm hover:underline"
                  title={att.file_name}
                  download
                >
                  {att.file_name}
                </a>
                <span className="text-xs text-muted-foreground ml-2">{att.size ? `${(att.size / 1024).toFixed(1)} KB` : ''}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="ml-auto"
                  onClick={() => deleteAttachment(att)}
                  disabled={isUploading}
                  aria-label="Delete attachment"
                >
                  <X size={16} />
                </Button>
                {renderAttachmentActions && renderAttachmentActions(att)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}) 