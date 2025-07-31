import Typesense from 'typesense';

const typesense = new Typesense.Client({
  nodes: [
    {
      host: process.env.NEXT_PUBLIC_TYPESENSE_HOST || 'your-cluster.typesense.net', // no https or port here
      port: 443,
      protocol: 'https',
    },
  ],
  apiKey: process.env.TYPESENSE_ADMIN_API_KEY || 'YOUR_ADMIN_API_KEY',
  connectionTimeoutSeconds: 5,
});

export default typesense; 