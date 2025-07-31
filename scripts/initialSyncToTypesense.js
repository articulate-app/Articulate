import { createClient } from '@supabase/supabase-js';
import Typesense from 'typesense';

// 1. Connect to Supabase
const supabase = createClient(
  'https://hlszgarnpleikfkwujph.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhsc3pnYXJucGxlaWtma3d1anBoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MzY5ODI1MCwiZXhwIjoyMDU5Mjc0MjUwfQ.yoCP5sqshIB1adqIRW3xlhDXHhSdFxu5AA0XErCrI4w'
);

// 2. Connect to Typesense
const typesense = new Typesense.Client({
  nodes: [
    {
      host: 'rdnm4pqijsz06akfp-1.a1.typesense.net',
      port: 443,
      protocol: 'https',
    },
  ],
  apiKey: 'LIzI84v8TUtiIsitQYsrn0O9hpxU9FdU',
  connectionTimeoutSeconds: 5,
});

// 3. Transform your task for Typesense
const transformTask = (task) => ({
    id: String(task.id),
    title: task.title,
    assigned_to_name: task.assigned_to_name,
    assigned_to_id: task.assigned_to_id,
    project_name: task.project_name,
    project_id_int: task.project_id_int,
    content_type_title: task.content_type_title,
    content_type_id: task.content_type_id,
    production_type_title: task.production_type_title,
    production_type_id: task.production_type_id,
    language_code: task.language_code,
    language_id: task.language_id,
    copy_post: task.copy_post,
    briefing: task.briefing,
    notes: task.notes,
    meta_title: task.meta_title,
    meta_description: task.meta_description,
    keyword: task.keyword,
    channel_names: task.channel_names || [],
    publication_timestamp: task.publication_date
  ? new Date(task.publication_date).getTime()
  : 0, // Fallback to 0 if no publication date (for Typesense sort compatibility)

    delivery_date: task.delivery_date
      ? new Date(task.delivery_date).getTime()
      : null,
    updated_at: task.updated_at
      ? new Date(task.updated_at).getTime()
      : null,
    project_status_id: task.project_status_id,
    project_status_name: task.project_status_name,
    project_status_color: task.project_status_color,
    
  });
    

async function run() {
  console.log('Fetching tasks from Supabase...');
  const { data: tasks, error } = await supabase.from('tasks').select('*');

  if (error) {
    console.error('Supabase error:', error);
    return;
  }

  const documents = tasks.map(transformTask);
  const ndjson = documents.map((doc) => JSON.stringify(doc)).join('\n');

  console.log(`Importing ${documents.length} tasks to Typesense...`);
  const result = await typesense
    .collections('tasks')
    .documents()
    .import(ndjson, { action: 'upsert' });

  console.log('Typesense import result:\n', result);
}

run().catch(console.error);
