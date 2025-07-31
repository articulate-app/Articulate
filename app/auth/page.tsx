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
        if (redirect) {
          router.push(redirect);
        } else {
          router.push('/dashboard');
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
          if (redirect) {
            router.push(redirect);
          } else {
            router.push('/dashboard');
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