import Typesense from 'typesense';

// Validate required environment variables
const typesenseHost = process.env.NEXT_PUBLIC_TYPESENSE_HOST;
const typesenseApiKey = process.env.TYPESENSE_ADMIN_API_KEY;

if (!typesenseHost || !typesenseApiKey) {
  throw new Error('Missing required Typesense environment variables: NEXT_PUBLIC_TYPESENSE_HOST and TYPESENSE_ADMIN_API_KEY');
}

const typesense = new Typesense.Client({
  nodes: [
    {
      host: typesenseHost,
      port: 443,
      protocol: 'https',
    },
  ],
  apiKey: typesenseApiKey,
  connectionTimeoutSeconds: 5,
});

export default typesense; 