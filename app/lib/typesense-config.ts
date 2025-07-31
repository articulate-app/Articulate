// Typesense configuration
export const typesenseConfig = {
  host: process.env.NEXT_PUBLIC_TYPESENSE_HOST || 'rdnm4pqijsz06akfp-1.a1.typesense.net',
  apiKey: process.env.NEXT_PUBLIC_TYPESENSE_SEARCH_ONLY_API_KEY || 'fGzkLFoFFwvqp7zVxW96kd1xfS9xjdsf',
  port: 443,
  protocol: 'https' as const,
};

// Debug logging
if (typeof window !== 'undefined') {
  console.log('[Typesense Config] Environment check:', {
    host: typesenseConfig.host,
    apiKeyLength: typesenseConfig.apiKey.length,
    nodeEnv: process.env.NODE_ENV,
    isClient: typeof window !== 'undefined'
  });
} 