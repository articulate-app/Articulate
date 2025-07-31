import Typesense from 'typesense';
import { typesenseConfig } from './typesense-config';

let typesenseSearch: any = null;

const createTypesenseClient = () => {
  // Only validate environment variables when the client is actually created
  if (typeof window === 'undefined') {
    // Server-side: return null
    console.log('[Typesense] Server-side, returning null');
    return null;
  }

  console.log('[Typesense] Creating client with config:', {
    host: typesenseConfig.host,
    apiKeyLength: typesenseConfig.apiKey.length,
    nodeEnv: process.env.NODE_ENV
  });

  return new Typesense.Client({
    nodes: [
      {
        host: typesenseConfig.host,
        port: typesenseConfig.port,
        protocol: typesenseConfig.protocol,
      },
    ],
    apiKey: typesenseConfig.apiKey,
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