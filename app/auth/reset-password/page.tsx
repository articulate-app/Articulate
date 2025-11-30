'use client';

import { useState, useEffect, Suspense, ChangeEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const accessToken = searchParams.get('access_token');
  const type = searchParams.get('type');
  
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isTokenValid, setIsTokenValid] = useState(false);

  useEffect(() => {
    const validateUser = async () => {
      const supabase = createClientComponentClient();
  
      const { data: { user }, error } = await supabase.auth.getUser();
  
      if (!user || error) {
        setError('Invalid or expired reset link. Please request a new one.');
        return;
      }
  
      setIsTokenValid(true);
    };
  
    validateUser();
  }, []);
  
  
  
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    try {
      const supabase = createClientComponentClient();
      const { error } = await supabase.auth.updateUser({
        password: password
      });
      
      if (error) {
        throw error;
      }
      
      setMessage('Password updated successfully! Redirecting to tasks...');
      setTimeout(() => {
        router.push('/tasks');
      }, 2000);
    } catch (error: any) {
      setError(error.message || 'An error occurred while updating your password');
    } finally {
      setLoading(false);
    }
  };

  if (!isTokenValid) {
    return (
      <div className="container relative h-screen flex-col items-center justify-center grid lg:max-w-none lg:grid-cols-1 lg:px-0">
        <div className="mx-auto w-full sm:w-[350px] space-y-6">
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-2xl font-semibold">
                {error || 'Validating reset link...'}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="container relative h-screen flex-col items-center justify-center grid lg:max-w-none lg:grid-cols-1 lg:px-0">
      <div className="mx-auto w-full sm:w-[350px] space-y-6">
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-semibold">
              Set your new password
            </CardTitle>
            <CardDescription>
              Enter your new password below to complete the reset process
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Enter your new password"
                  value={password}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm New Password</Label>
                <Input
                  id="confirm-password"
                  name="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Confirm your new password"
                  value={confirmPassword}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              {message && <p className="text-sm text-green-500">{message}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Updating...' : 'Update Password'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="container relative h-screen flex-col items-center justify-center grid lg:max-w-none lg:grid-cols-1 lg:px-0">
        <div className="mx-auto w-full sm:w-[350px] space-y-6">
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-2xl font-semibold">
                Loading...
              </CardTitle>
            </CardHeader>
          </Card>
        </div>
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  );
} 