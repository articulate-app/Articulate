import Typesense from 'typesense';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const typesense = new Typesense.Client({
  nodes: [
    {
      host: process.env.TYPESENSE_HOST || 'rdnm4pqijsz06akfp-1.a1.typesense.net',
      port: 443,
      protocol: 'https',
    },
  ],
  apiKey: process.env.TYPESENSE_ADMIN_API_KEY || '',
  connectionTimeoutSeconds: 5,
});

const fieldsToModify = [
  'title',
  'assigned_to_name',
  'project_name',
  'content_type_title',
  'production_type_title',
  'language_code',
  'project_status_name'
];

const patchPayload = {
  fields: fieldsToModify.flatMap((field) => [
    { name: field, drop: true },
    {
      name: field,
      type: 'string',
      sort: true,
      optional: true,
    },
  ]),
};

async function run() {
  try {
    console.log('🔧 Updating fields to be sortable...');
    const result = await typesense.collections('tasks').update(patchPayload);
    console.log('✅ Schema updated:', result);
  } catch (err) {
    console.error('❌ Failed to update schema:', err.message);
  }
}

run();
