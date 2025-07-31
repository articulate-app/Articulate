import Typesense from 'typesense';

let typesenseSearch: any = null;

const createTypesenseClient = () => {
  // Only validate environment variables when the client is actually created
  if (typeof window === 'undefined') {
    // Server-side: return null
    console.log('[Typesense] Server-side, returning null');
    return null;
  }

  // Access environment variables correctly for client-side
  // In Next.js, NEXT_PUBLIC_ variables should be available at build time
  const typesenseHost = process.env.NEXT_PUBLIC_TYPESENSE_HOST;
  const typesenseApiKey = process.env.NEXT_PUBLIC_TYPESENSE_SEARCH_ONLY_API_KEY;

  console.log('[Typesense] Environment check:', {
    host: typesenseHost ? 'present' : 'missing',
    apiKey: typesenseApiKey ? 'present' : 'missing',
    window: typeof window !== 'undefined',
    nodeEnv: process.env.NODE_ENV,
    // Log the actual values for debugging (be careful with sensitive data)
    hostValue: typesenseHost,
    apiKeyLength: typesenseApiKey ? typesenseApiKey.length : 0
  });

  if (!typesenseHost || !typesenseApiKey) {
    console.error('[Typesense] Missing environment variables:', {
      host: typesenseHost,
      apiKey: typesenseApiKey ? '***' : 'missing'
    });
    // Return null instead of throwing to prevent app crashes
    return null;
  }

  console.log('[Typesense] Creating client with host:', typesenseHost);
  
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
    console.log('[Typesense] Creating new client instance');
    typesenseSearch = createTypesenseClient();
  } else {
    console.log('[Typesense] Using existing client instance');
  }
  return typesenseSearch;
};

export default getTypesenseClient; 