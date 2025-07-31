/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000', 'localhost:3001', 'app.whyarticulate.com']
    }
  },
  images: {
    domains: ['localhost', 'app.whyarticulate.com'],
  },
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
  output: 'standalone',
  // Disable static generation to avoid SSR issues with client-side code
  trailingSlash: false
}

module.exports = nextConfig 