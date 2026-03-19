import { ArrowRight, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { getMe } from '@/lib/server/me';
import { Button } from '@/components/ui/button';

export default async function AuthAwareButtons({ variant = 'primary' }: { variant?: string }) {
  const user = await getMe();
  const isAuthenticated = !!user;

  // Navigation buttons for the header
  if (variant === 'nav') {
    return isAuthenticated ? (
      <Button asChild>
        <Link href="/app">Go to Dashboard</Link>
      </Button>
    ) : (
      <>
        <Link
          href="/auth/login"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          Login
        </Link>
        <Button asChild>
          <Link href="/auth/register">Get Started</Link>
        </Button>
      </>
    );
  }

  // Primary buttons for the hero section
  return isAuthenticated ? (
    <Button asChild size="lg">
      <Link href="/app">
        Go to Dashboard
        <ArrowRight className="ml-2 h-5 w-5" />
      </Link>
    </Button>
  ) : (
    <>
      <Button asChild size="lg">
        <Link href="/auth/register">
          Start Building Free
          <ArrowRight className="ml-2 h-5 w-5" />
        </Link>
      </Button>
      <Button asChild size="lg" variant="outline">
        <Link href="#features">
          Learn More
          <ChevronRight className="ml-2 h-5 w-5" />
        </Link>
      </Button>
    </>
  );
}
