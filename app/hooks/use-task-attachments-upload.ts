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
  onChange?: (attachments: DropzoneAttachment[]) => void;
}

export function useTaskAttachmentsUpload({ tableName, recordId, bucketName = 'task-files', onChange }: UseTaskAttachmentsUploadProps) {
  const supabase = createClientComponentClient();
  const [attachments, setAttachments] = useState<DropzoneAttachment[]>([]);
  const [signedUrls, setSignedUrls] = useState<{ [id: string]: string }>({});
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Fetch attachments for this record
  const fetchAttachments = useCallback(async () => {
    const { data, error } = await supabase
      .from('attachments')
      .select('*')
      .eq('table_name', tableName)
      .eq('record_id', String(recordId))
      .order('uploaded_at', { ascending: false });
    if (!error && Array.isArray(data)) {
      setAttachments(data);
      onChange?.(data);
    }
  }, [supabase, tableName, recordId, onChange]);

  // Fetch signed URLs for all attachments
  useEffect(() => {
    async function fetchSignedUrls() {
      if (attachments.length === 0) {
        setSignedUrls({});
        return;
      }
      const filePaths = attachments.map(att => att.file_path);
      const { data, error } = await supabase.storage.from(bucketName).createSignedUrls(filePaths, 60 * 60); // 1 hour
      if (!error && Array.isArray(data)) {
        const urlMap: { [id: string]: string } = {};
        data.forEach((item, idx) => {
          urlMap[attachments[idx].id] = item.signedUrl;
        });
        setSignedUrls(urlMap);
      } else {
        setSignedUrls({});
      }
    }
    fetchSignedUrls();
  }, [attachments, supabase, bucketName]);

  useEffect(() => {
    fetchAttachments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableName, recordId]);

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
      await fetchAttachments();
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
      await fetchAttachments();
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