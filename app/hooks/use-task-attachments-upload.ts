import { useState, useEffect, useCallback } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

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
  onUploadOrDelete?: () => void;
}

export function useTaskAttachmentsUpload({ tableName, recordId, bucketName = 'task-files', onUploadOrDelete }: UseTaskAttachmentsUploadProps) {
  const supabase = createClientComponentClient();
  const [attachments, setAttachments] = useState<DropzoneAttachment[]>([]);
  const [signedUrls, setSignedUrls] = useState<{ [id: string]: string }>({});
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Fetch attachments
  const fetchAttachments = useCallback(async () => {
    if (!recordId) return;
    
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
  }, [recordId, tableName, bucketName, supabase]);

  // Fetch attachments on mount and when recordId changes
  useEffect(() => {
    fetchAttachments();
  }, [fetchAttachments]);

  // Upload files
  const uploadFiles = async (files: FileList | File[]) => {
    setIsUploading(true);
    setUploadError(null);
    try {
      for (const file of Array.from(files)) {
        const filePath = `${recordId}/${Date.now()}-${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from(bucketName)
          .upload(filePath, file);
        if (uploadError) throw uploadError;
        // Insert attachment row
        const { error: dbError } = await supabase
          .from('attachments')
          .insert({
            table_name: tableName,
            record_id: String(recordId),
            file_name: file.name,
            file_path: filePath,
            mime_type: file.type,
            size: file.size,
          });
        if (dbError) throw dbError;
      }
      // Refresh attachments after upload
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
    setIsUploading(true);
    setUploadError(null);
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
      // Refresh attachments after deletion
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