import { createClient } from '@supabase/supabase-js';
import Typesense from 'typesense';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

// Validate required environment variables
const requiredEnvVars = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  TYPESENSE_HOST: process.env.TYPESENSE_HOST,
  TYPESENSE_ADMIN_API_KEY: process.env.TYPESENSE_ADMIN_API_KEY,
};

// Check for missing environment variables
const missingVars = Object.entries(requiredEnvVars)
  .filter(([key, value]) => !value)
  .map(([key]) => key);

if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:');
  missingVars.forEach(varName => console.error(`   - ${varName}`));
  console.error('\nPlease ensure all required environment variables are set in your .env.local file.');
  process.exit(1);
}

// 1. Connect to Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 2. Connect to Typesense
const typesense = new Typesense.Client({
  nodes: [
    {
      host: process.env.TYPESENSE_HOST,
      port: 443,
      protocol: 'https',
    },
  ],
  apiKey: process.env.TYPESENSE_ADMIN_API_KEY,
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
