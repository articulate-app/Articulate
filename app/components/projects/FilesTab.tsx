"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "../ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu"
import { Input } from "../ui/input"
import { Loader2, Upload, MoreVertical, Download, Copy, Trash2, File } from "lucide-react"
import { toast } from "../ui/use-toast"
import { format } from "date-fns"
import {
  listFiles,
  uploadProjectFile,
  deleteProjectFile,
  getFileUrl,
  type ProjectFile,
} from "../../lib/services/projects-briefing"
import { useCurrentUserStore } from "../../store/current-user"

interface FilesTabProps {
  projectId: number
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes"
  const k = 1024
  const sizes = ["Bytes", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i]
}

export function FilesTab({ projectId }: FilesTabProps) {
  const queryClient = useQueryClient()
  const publicUserId = useCurrentUserStore((s) => s.publicUserId)
  const [files, setFiles] = useState<ProjectFile[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [renamingFileId, setRenamingFileId] = useState<number | null>(null)
  const [newFileName, setNewFileName] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const limit = 50

  const fetchFiles = useCallback(async () => {
    if (isLoading) {
      console.log("Already loading files, skipping...")
      return
    }
    if (!hasMore && offset > 0) {
      console.log("No more files to load")
      return
    }

    setIsLoading(true)
    try {
      const { data, error } = await listFiles(projectId, limit, offset)

      if (error) {
        console.error("Error fetching files:", error)
        toast({
          title: "Error",
          description: `Failed to load files: ${error.message || String(error)}`,
          variant: "destructive",
        })
        return
      }

      if (data && Array.isArray(data)) {
        if (data.length < limit) {
          setHasMore(false)
        }
        if (offset === 0) {
          // First page - replace all files
          setFiles(data)
        } else {
          // Subsequent pages - append
          setFiles((prev) => [...prev, ...data])
        }
        setOffset((prev) => prev + data.length)
      } else {
        setHasMore(false)
        if (offset === 0) {
          setFiles([])
        }
      }
    } catch (err) {
      console.error("Error fetching files:", err)
      toast({
        title: "Error",
        description: `Failed to load files: ${err instanceof Error ? err.message : String(err)}`,
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }, [projectId, limit, offset])

  useEffect(() => {
    // Reset state when projectId changes
    setFiles([])
    setOffset(0)
    setHasMore(true)
    setIsLoading(false)
  }, [projectId])

  useEffect(() => {
    // Fetch files when offset changes or projectId changes
    if (offset === 0 && hasMore) {
      fetchFiles()
    }
  }, [projectId, fetchFiles])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    try {
      const { data, error } = await uploadProjectFile(projectId, file)

      if (error) {
        toast({
          title: "Upload failed",
          description: error.message || "Failed to upload file",
          variant: "destructive",
        })
      } else {
        toast({
          title: "File uploaded",
          description: `${file.name} has been uploaded successfully`,
        })
        queryClient.invalidateQueries({
          queryKey: ["project-files", projectId],
        })
        // Reset and refetch
        setFiles([])
        setOffset(0)
        setHasMore(true)
        setIsLoading(false) // Reset loading state
        // Fetch files again immediately
        listFiles(projectId, limit, 0).then(({ data, error }) => {
          if (!error && data) {
            setFiles(data)
            setOffset(data.length)
            setHasMore(data.length === limit)
          }
        })
      }
    } catch (err: any) {
      toast({
        title: "Upload failed",
        description: err.message || "Failed to upload file",
        variant: "destructive",
      })
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  const handleDownload = async (file: ProjectFile) => {
    try {
      let url = file.file_url

      // If it's a storage path, get signed URL
      if (file.storage_path && !file.file_url.startsWith("http")) {
        const signedUrl = await getFileUrl(file.storage_path)
        if (signedUrl) {
          url = signedUrl
        }
      }

      window.open(url, "_blank")
    } catch (err: any) {
      toast({
        title: "Download failed",
        description: err.message || "Failed to download file",
        variant: "destructive",
      })
    }
  }

  const handleCopyLink = async (file: ProjectFile) => {
    try {
      let url = file.file_url

      if (file.storage_path && !file.file_url.startsWith("http")) {
        const signedUrl = await getFileUrl(file.storage_path)
        if (signedUrl) {
          url = signedUrl
        }
      }

      await navigator.clipboard.writeText(url)
      toast({
        title: "Link copied",
        description: "File link copied to clipboard",
      })
    } catch (err: any) {
      toast({
        title: "Copy failed",
        description: err.message || "Failed to copy link",
        variant: "destructive",
      })
    }
  }

  const handleRename = async (fileId: number, newName: string) => {
    if (!newName.trim()) {
      toast({
        title: "Invalid name",
        description: "File name cannot be empty",
        variant: "destructive",
      })
      return
    }

    try {
      // Update the file_name in the database
      const { createClientComponentClient } = await import(
        "@supabase/auth-helpers-nextjs"
      )
      const supabase = createClientComponentClient()
      const { error } = await supabase
        .from("project_files")
        .update({ file_name: newName })
        .eq("id", fileId)

      if (error) {
        toast({
          title: "Rename failed",
          description: error.message || "Failed to rename file",
          variant: "destructive",
        })
      } else {
        toast({
          title: "File renamed",
          description: "File name updated successfully",
        })
        queryClient.invalidateQueries({
          queryKey: ["project-files", projectId],
        })
        setFiles([])
        setOffset(0)
        setHasMore(true)
        fetchFiles()
      }
    } catch (err: any) {
      toast({
        title: "Rename failed",
        description: err.message || "Failed to rename file",
        variant: "destructive",
      })
    } finally {
      setRenamingFileId(null)
      setNewFileName("")
    }
  }

  const handleDelete = async (fileId: number) => {
    // Optimistic update
    setFiles((prev) =>
      prev.map((f) => (f.id === fileId ? { ...f, is_deleted: true } : f))
    )

    try {
      const { error } = await deleteProjectFile(fileId)

      if (error) {
        toast({
          title: "Delete failed",
          description: error.message || "Failed to delete file",
          variant: "destructive",
        })
        queryClient.invalidateQueries({
          queryKey: ["project-files", projectId],
        })
        setFiles([])
        setOffset(0)
        setHasMore(true)
        fetchFiles()
      } else {
        toast({
          title: "File deleted",
          description: "File has been removed",
        })
      }
    } catch (err: any) {
      toast({
        title: "Delete failed",
        description: err.message || "Failed to delete file",
        variant: "destructive",
      })
      queryClient.invalidateQueries({
        queryKey: ["project-files", projectId],
      })
      setFiles([])
      setOffset(0)
      setHasMore(true)
      fetchFiles()
    }
  }

  const visibleFiles = files.filter((f) => !f.is_deleted)

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Files</h2>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleUpload}
              className="hidden"
              id="file-upload"
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              {isUploading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Upload className="w-4 h-4 mr-2" />
              )}
              Upload File
            </Button>
          </div>
        </div>
        {/* Hint about chat uploads */}
        <div className="mb-4 rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm text-blue-700">
          Files from chat uploads also appear here.
        </div>

        {/* Files List */}
        <div className="space-y-2">
          {visibleFiles.length === 0 && !isLoading && (
            <div className="py-8 text-center text-gray-500">
              No files uploaded yet. Upload your first file to get started.
            </div>
          )}

          {visibleFiles.map((file) => (
            <div
              key={file.id}
              className="flex items-center justify-between rounded-lg border border-gray-200 p-4 hover:bg-gray-50"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <File className="w-5 h-5 text-gray-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  {renamingFileId === file.id ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={newFileName}
                        onChange={(e) => setNewFileName(e.target.value)}
                        onBlur={() => {
                          if (newFileName.trim()) {
                            handleRename(file.id, newFileName)
                          } else {
                            setRenamingFileId(null)
                            setNewFileName("")
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            if (newFileName.trim()) {
                              handleRename(file.id, newFileName)
                            }
                          } else if (e.key === "Escape") {
                            setRenamingFileId(null)
                            setNewFileName("")
                          }
                        }}
                        autoFocus
                        className="h-8"
                      />
                    </div>
                  ) : (
                    <>
                      <div className="font-medium text-sm text-gray-900 truncate">
                        {file.file_name}
                      </div>
                      <div className="text-xs text-gray-500">
                        {formatFileSize(file.file_size)} · {file.file_type} ·{" "}
                        {file.uploaded_by_name || `User ${file.uploaded_by}`} ·{" "}
                        {format(new Date(file.created_at), "PPp")}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleDownload(file)}>
                    <Download className="w-4 h-4 mr-2" />
                    Download
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleCopyLink(file)}>
                    <Copy className="w-4 h-4 mr-2" />
                    Copy link
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setRenamingFileId(file.id)
                      setNewFileName(file.file_name)
                    }}
                  >
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => handleDelete(file.id)}
                    className="text-destructive"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}

          {isLoading && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          )}
        </div>
    </div>
  )
}

