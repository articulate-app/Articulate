import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ClientProviders } from './components/providers/client-providers';
import { Toaster } from './components/ui/toaster';
import { TooltipProvider } from './components/ui/tooltip';
import { CurrentUserProvider } from './components/providers/current-user-provider';
import { WorkspaceRouteSwitch } from './components/shell/WorkspaceRouteSwitch';

// Disable static generation for the entire app
export const dynamic = 'force-dynamic';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Articulate',
  description: 'Articulate — AI workspace for teams',
  icons: {
    icon: [{ url: '/brand-mark.png', type: 'image/png' }],
    shortcut: ['/brand-mark.png'],
    apple: [{ url: '/brand-mark.png', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
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
            <TooltipProvider>
              <Toaster />
              <WorkspaceRouteSwitch>{children}</WorkspaceRouteSwitch>
            </TooltipProvider>
          </ClientProviders>
        </CurrentUserProvider>
      </body>
    </html>
  )
} 