import Typesense from 'typesense';

const typesenseSearch = new Typesense.Client({
  nodes: [
    {
      host: process.env.NEXT_PUBLIC_TYPESENSE_HOST || 'rdnm4pqijsz06akfp-1.a1.typesense.net',
      port: 443,
      protocol: 'https',
    },
  ],
  apiKey: process.env.NEXT_PUBLIC_TYPESENSE_SEARCH_ONLY_API_KEY || process.env.TYPESENSE_SEARCH_ONLY_API_KEY || '',
  connectionTimeoutSeconds: 5,
});

export default typesenseSearch; 