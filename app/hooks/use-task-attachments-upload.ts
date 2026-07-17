import { useState, useEffect, useCallback } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { normalizeBootstrapAttachments } from '@/lib/types/task-details-bootstrap';
import { sanitizeStorageFileName } from '../../utils/storage';

export interface DropzoneAttachment {
  id: string;
  file_name: string;
  file_path: string;
  uploaded_at: string;
  uploaded_by: string | null;
  mime_type: string | null;
  size: number | null;
}

interface UseTaskAttachmentsUploadProps {
  tableName: string;
  recordId: string | number;
  bucketName?: string;
  enabled?: boolean;
  onUploadOrDelete?: () => void;
  /** Called after each successful upload with new attachment row(s). Use to update task query cache so UI shows new attachments immediately. */
  onUploadSuccess?: (newAttachments: DropzoneAttachment[], recordId: string | number) => void;
  /** Called after successful delete. Use to remove attachment from task query cache. */
  onDeleteSuccess?: (attachmentId: string, recordId: string | number) => void;
  /**
   * When true, skip the initial `attachments` table read; seed from `bootstrapAttachments` and sign URLs only.
   * Updates when `bootstrapAttachments` changes (e.g. task-details-bootstrap merge).
   */
  seedFromBootstrap?: boolean;
  /** Rows from task-details-bootstrap `attachments` (or merged task). Ignored unless `seedFromBootstrap`. */
  bootstrapAttachments?: unknown;
}

export function useTaskAttachmentsUpload({
  tableName,
  recordId,
  bucketName = 'task-files',
  enabled = true,
  onUploadOrDelete,
  onUploadSuccess,
  onDeleteSuccess,
  seedFromBootstrap = false,
  bootstrapAttachments,
}: UseTaskAttachmentsUploadProps) {
  const supabase = createClientComponentClient();
  const [attachments, setAttachments] = useState<DropzoneAttachment[]>([]);
  const [signedUrls, setSignedUrls] = useState<{ [id: string]: string }>({});
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    if (enabled) return;
    setAttachments([]);
    setSignedUrls({});
  }, [enabled]);

  // Fetch attachments
  const fetchAttachments = useCallback(async () => {
    if (!enabled || !recordId) return;
    
    try {
      const { data: attachmentsData, error: attachmentsError } = await supabase
        .from('attachments')
        .select('*')
        .eq('table_name', tableName)
        .eq('record_id', String(recordId))
        .order('uploaded_at', { ascending: false });

      if (attachmentsError) throw attachmentsError;

      setAttachments(attachmentsData || []);

      // Generate signed URLs for attachments
      if (attachmentsData && attachmentsData.length > 0) {
        const urls: { [id: string]: string } = {};
        for (const attachment of attachmentsData) {
          const { data: signedUrl } = await supabase.storage
            .from(bucketName)
            .createSignedUrl(attachment.file_path, 3600); // 1 hour expiry
          if (signedUrl) {
            urls[attachment.id] = signedUrl.signedUrl;
          }
        }
        setSignedUrls(urls);
      }
    } catch (err: any) {
      console.error('Error fetching attachments:', err);
    }
  }, [enabled, recordId, tableName, bucketName, supabase]);

  // Seed from task-details-bootstrap: no `attachments` table query on open; still sign storage URLs.
  useEffect(() => {
    if (!enabled || !seedFromBootstrap || !recordId) return;
    let cancelled = false;
    const rows = normalizeBootstrapAttachments(bootstrapAttachments);
    setAttachments(rows);
    (async () => {
      if (rows.length === 0) {
        if (!cancelled) setSignedUrls({});
        return;
      }
      const urls: { [id: string]: string } = {};
      for (const attachment of rows) {
        const { data: signedUrl } = await supabase.storage
          .from(bucketName)
          .createSignedUrl(attachment.file_path, 3600);
        if (signedUrl) urls[attachment.id] = signedUrl.signedUrl;
      }
      if (!cancelled) setSignedUrls(urls);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, seedFromBootstrap, bootstrapAttachments, recordId, bucketName, supabase]);

  // Fetch attachments on mount when not seeded from bootstrap
  useEffect(() => {
    if (!enabled) return;
    if (seedFromBootstrap) return;
    void fetchAttachments();
  }, [enabled, fetchAttachments, seedFromBootstrap]);

  // Upload files
  const uploadFiles = async (files: FileList | File[]) => {
    if (!enabled) return;
    setIsUploading(true);
    setUploadError(null);
    const uploadedForRecordId = recordId;
    const newAttachments: DropzoneAttachment[] = [];
    try {
      for (const file of Array.from(files)) {
        const safeName = sanitizeStorageFileName(file.name);
        const filePath = `${recordId}/${Date.now()}-${safeName}`;
        const { error: uploadError } = await supabase.storage
          .from(bucketName)
          .upload(filePath, file);
        if (uploadError) throw uploadError;
        const { data: inserted, error: dbError } = await supabase
          .from('attachments')
          .insert({
            table_name: tableName,
            record_id: String(recordId),
            file_name: file.name,
            file_path: filePath,
            mime_type: file.type,
            size: file.size,
          })
          .select()
          .single();
        if (dbError) throw dbError;
        if (inserted) {
          const row = inserted as DropzoneAttachment;
          newAttachments.push(row);
          const { data: signedUrl } = await supabase.storage.from(bucketName).createSignedUrl(row.file_path, 3600);
          if (signedUrl) setSignedUrls((prev) => ({ ...prev, [row.id]: signedUrl.signedUrl }));
        }
      }
      if (newAttachments.length > 0) onUploadSuccess?.(newAttachments, uploadedForRecordId);
      await fetchAttachments();
      onUploadOrDelete?.();
    } catch (err: any) {
      setUploadError(err.message || 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  // Delete attachment
  const deleteAttachment = async (attachment: DropzoneAttachment) => {
    if (!enabled) return;
    setIsUploading(true);
    setUploadError(null);
    const deletedForRecordId = recordId;
    try {
      // Remove from storage
      const { error: storageError } = await supabase.storage
        .from(bucketName)
        .remove([attachment.file_path]);
      if (storageError) throw storageError;
      // Remove from DB
      const { error: dbError } = await supabase
        .from('attachments')
        .delete()
        .eq('id', attachment.id);
      if (dbError) throw dbError;
      onDeleteSuccess?.(attachment.id, deletedForRecordId);
      await fetchAttachments();
      onUploadOrDelete?.();
    } catch (err: any) {
      setUploadError(err.message || 'Delete failed');
    } finally {
      setIsUploading(false);
    }
  };

  return {
    attachments,
    signedUrls,
    isUploading,
    uploadError,
    uploadFiles,
    deleteAttachment,
    fetchAttachments,
  };
} 