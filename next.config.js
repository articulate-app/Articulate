/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000', 'localhost:3001', 'localhost:3010', '127.0.0.1:3010', 'app.whyarticulate.com']
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
  trailingSlash: false,
  transpilePackages: [
    '@tiptap/extension-collaboration',
    '@tiptap/extension-collaboration-cursor',
    '@tiptap/html',
    'y-prosemirror',
    'y-protocols',
    'yjs',
  ],
  webpack: (config) => {
    // unpdf's bundled PDF.js uses private fields Next 14 SWC cannot parse.
    // PDF drop-import uses features/artifacts/pdf-bytes-to-text.ts instead.
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      unpdf: false,
    }
    config.plugins.push(
      new (require('webpack').IgnorePlugin)({
        resourceRegExp: /(?:^|\/)unpdf(?:\/|$)/,
      })
    )
    return config
  },
}

module.exports = nextConfig 