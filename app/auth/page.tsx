'use client';

import { useState, ChangeEvent, useEffect } from 'react';

// Disable static generation for this page
export const dynamic = 'force-dynamic';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

type OAuthProvider = 'google' | 'apple'

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

function AppleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M16.365 1.43c0 1.14-.42 2.2-1.18 3.01-.79.85-2.1 1.5-3.22 1.41-.14-1.1.41-2.25 1.17-3.05.8-.86 2.2-1.5 3.23-1.37zM20.5 17.2c-.58 1.34-.86 1.93-1.61 3.11-1.04 1.61-2.51 3.62-4.34 3.64-1.62.02-2.04-1.06-4.25-1.05-2.2.01-2.67 1.07-4.29 1.05-1.83-.02-3.23-1.83-4.27-3.44C-.2 16.86-.9 12.2 1.08 9.2c1.14-1.73 2.95-2.82 4.64-2.82 1.73 0 2.82 1.07 4.25 1.07 1.39 0 2.24-1.08 4.25-1.08 1.52 0 3.13.83 4.27 2.26-3.75 2.06-3.14 7.42 2.01 8.57z" />
    </svg>
  );
}

export default function AuthPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect');
  
  const supabase = createClientComponentClient();

  // Check for existing session on component mount
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (session) {
        const next =
          redirect && redirect.startsWith("/") ? redirect : "/tasks"
        if (typeof window !== "undefined" && window.articulateDesktop?.isDesktop) {
          window.location.assign(next)
          return
        }
        if (redirect) {
          router.push(redirect);
        } else {
          router.push('/tasks');
        }
      }
    };
    checkSession();
  }, [router, supabase.auth, redirect]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setIsLoading(true);

    try {
      if (mode === 'sign-up') {
        if (password !== confirmPassword) {
          setError('Passwords do not match');
          return;
        }

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ''}`,
          },
        });
        
        if (error) throw error;
        if (data?.user) {
          setMessage('Check your email for the confirmation link!');
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        
        if (error) throw error;
        
        // Verify the session was created
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        
        if (session) {
          const next =
            redirect && redirect.startsWith("/") ? redirect : "/tasks"
          // Electron + Next Fast Refresh: soft router navigations can land in the
          // "missing required error components" loop. Hard navigation is reliable.
          if (typeof window !== "undefined" && window.articulateDesktop?.isDesktop) {
            window.location.assign(next)
            return
          }
          if (redirect) {
            router.push(redirect)
          } else {
            router.push('/tasks')
          }
        } else {
          throw new Error('Failed to create session');
        }
      }
    } catch (error: any) {
      console.error('Authentication error:', error);
      setError(error.message || 'An error occurred during authentication');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!email) {
      setError('Please enter your email address');
      return;
    }

    setError(null);
    setMessage(null);
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/reset-password`,
      });
      
      if (error) throw error;
      setMessage('Check your email for the password reset link!');
    } catch (error: any) {
      console.error('Password reset error:', error);
      setError(error.message || 'An error occurred while resetting password');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSocialLogin = async (provider: OAuthProvider) => {
    setError(null);
    setMessage(null);
    setIsLoading(true);

    try {
      const nextPath =
        redirect && redirect.startsWith('/') ? redirect : '/tasks';
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/oauth?next=${encodeURIComponent(nextPath)}`,
        },
      });

      if (error) throw error;
    } catch (error: any) {
      console.error(`${provider} sign-in error:`, error);
      setError(error.message || `An error occurred during ${provider} sign-in`);
      setIsLoading(false);
    }
  };

  // When switching modes, update the URL to preserve the redirect param
  const handleModeSwitch = (newMode: 'sign-in' | 'sign-up') => {
    setMode(newMode);
    const params = new URLSearchParams(window.location.search);
    if (redirect) {
      params.set('redirect', redirect);
    }
    window.history.replaceState({}, '', `/auth${params.toString() ? '?' + params.toString() : ''}`);
  };

  return (
    <div className="container relative h-screen flex-col items-center justify-center grid lg:max-w-none lg:grid-cols-1 lg:px-0">
      <div className="mx-auto w-full sm:w-[350px] space-y-6">
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-semibold">
              {mode === 'sign-in' ? 'Sign in' : 'Create an account'}
            </CardTitle>
            <CardDescription>
              {mode === 'sign-in' 
                ? 'Enter your email and password to sign in to your account'
                : 'Enter your email below to create your account'
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAuth} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="m@example.com"
                  value={email}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center">
                  <Label htmlFor="password">Password</Label>
                  {mode === 'sign-in' && (
                    <Link
                      href="/auth/forgot-password"
                      className="ml-auto inline-block text-sm underline-offset-4 hover:underline"
                    >
                      Forgot your password?
                    </Link>
                  )}
                </div>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                  required
                />
              </div>
              {mode === 'sign-up' && (
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Repeat Password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>
              )}
              {error && <p className="text-sm text-red-500">{error}</p>}
              {message && <p className="text-sm text-green-500">{message}</p>}
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading 
                  ? (mode === 'sign-in' ? 'Signing in...' : 'Creating account...')
                  : (mode === 'sign-in' ? 'Sign in' : 'Create account')
                }
              </Button>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={isLoading}
                onClick={() => handleSocialLogin('google')}
              >
                <GoogleIcon className="mr-2 h-4 w-4" />
                Continue with Google
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={isLoading}
                onClick={() => handleSocialLogin('apple')}
              >
                <AppleIcon className="mr-2 h-4 w-4" />
                Continue with Apple
              </Button>
              <div className="text-center text-sm">
                {mode === 'sign-in' ? (
                  <>
                    Don't have an account?{' '}
                    <button
                      type="button"
                      onClick={() => handleModeSwitch('sign-up')}
                      className="underline underline-offset-4 hover:text-gray-900"
                    >
                      Sign up
                    </button>
                  </>
                ) : (
                  <>
                    Already have an account?{' '}
                    <button
                      type="button"
                      onClick={() => handleModeSwitch('sign-in')}
                      className="underline underline-offset-4 hover:text-gray-900"
                    >
                      Sign in
                    </button>
                  </>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
} 