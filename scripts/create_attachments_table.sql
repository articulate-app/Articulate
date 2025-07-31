-- Migration: Create attachments table for associating files with any record
CREATE TABLE IF NOT EXISTS attachments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name text NOT NULL, -- e.g., 'tasks', 'projects', 'users'
    record_id text NOT NULL,  -- id of the record in the referenced table
    file_name text NOT NULL,  -- original file name
    file_path text NOT NULL,  -- path in storage (e.g., 'task-files/123/filename')
    uploaded_by uuid REFERENCES users(id) ON DELETE SET NULL,
    uploaded_at timestamptz NOT NULL DEFAULT now(),
    mime_type text,
    size bigint
);

CREATE INDEX IF NOT EXISTS idx_attachments_table_record ON attachments(table_name, record_id); 