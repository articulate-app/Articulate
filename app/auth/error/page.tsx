import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'

export default function AuthErrorPage({
  searchParams,
}: {
  searchParams: { error?: string }
}) {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Sorry, something went wrong.</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {searchParams?.error ? (
                <p className="text-sm text-muted-foreground">Code error: {searchParams.error}</p>
              ) : (
                <p className="text-sm text-muted-foreground">An unspecified error occurred.</p>
              )}
              <Link
                href="/auth"
                className="text-sm underline underline-offset-4 hover:text-gray-900"
              >
                Back to sign in
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
