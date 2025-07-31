import Typesense from 'typesense';

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
