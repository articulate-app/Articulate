import Typesense from 'typesense';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

// Validate required environment variables
const requiredEnvVars = {
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
