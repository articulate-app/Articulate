import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ClientProviders } from './components/providers/client-providers';
import { Toaster } from './components/ui/toaster';
import { CurrentUserProvider } from './components/providers/current-user-provider';

// Disable static generation for the entire app
export const dynamic = 'force-dynamic';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Authentication App',
  description: 'A simple authentication app with Supabase',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <CurrentUserProvider>
          <ClientProviders>
            <Toaster />
            {children}
          </ClientProviders>
        </CurrentUserProvider>
      </body>
    </html>
  )
} 