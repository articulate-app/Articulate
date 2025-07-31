import Typesense from 'typesense';

let typesenseSearch: any = null;

const createTypesenseClient = () => {
  // Only validate environment variables when the client is actually created
  if (typeof window === 'undefined') {
    // Server-side: return null or throw error
    throw new Error('Typesense client cannot be created on the server side');
  }

  const typesenseHost = process.env.NEXT_PUBLIC_TYPESENSE_HOST;
  const typesenseApiKey = process.env.NEXT_PUBLIC_TYPESENSE_SEARCH_ONLY_API_KEY || process.env.TYPESENSE_SEARCH_ONLY_API_KEY;

  if (!typesenseHost || !typesenseApiKey) {
    throw new Error('Missing required Typesense environment variables: NEXT_PUBLIC_TYPESENSE_HOST and NEXT_PUBLIC_TYPESENSE_SEARCH_ONLY_API_KEY');
  }

  return new Typesense.Client({
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
};

const getTypesenseClient = () => {
  if (!typesenseSearch) {
    typesenseSearch = createTypesenseClient();
  }
  return typesenseSearch;
};

export default getTypesenseClient; 