import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { LogoutButton } from '@/components/logout-button';

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
        <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="container flex h-14 items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-bold">Articulate</span>
            </div>
            <LogoutButton />
          </div>
        </header>
        {children}
      </body>
    </html>
  );
} 