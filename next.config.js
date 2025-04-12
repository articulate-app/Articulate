/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000', 'localhost:3001', 'app.whyarticulate.com', 'www.app.whyarticulate.com']
    }
  },
  images: {
    domains: ['localhost', 'app.whyarticulate.com', 'www.app.whyarticulate.com'],
  },
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [
          {
            type: 'host',
            value: 'www.app.whyarticulate.com',
          },
        ],
        destination: 'https://app.whyarticulate.com/:path*',
        permanent: false,
      },
    ]
  },
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  }
}

module.exports = nextConfig 