import Link from 'next/link';
import AuthAwareButtons from '@/components/common/AuthAwareButtons';
import { MobileNavToggle } from '@/components/common/MobileNavToggle';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { LogoWordmark } from '@/components/common/logo';
import { BRAND } from '@/lib/copy/brand';

export function SiteNav() {
  return (
    <nav className="fixed top-0 w-full bg-background/80 backdrop-blur-md z-50 border-b border-border/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <Link href="/" aria-label={BRAND.home} className="flex-shrink-0 text-foreground">
            <LogoWordmark className="h-6" />
          </Link>
          <div className="hidden md:flex items-center space-x-8">
            <Link
              href="/#features"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Features
            </Link>
            <Link
              href="/#tech-stack"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Tech Stack
            </Link>
            <Link
              href="/#architecture"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Architecture
            </Link>
            <ThemeToggle />
            <AuthAwareButtons variant="nav" />
          </div>
          <MobileNavToggle>
            <Link
              href="/#features"
              className="block text-muted-foreground hover:text-foreground transition-colors py-1"
            >
              Features
            </Link>
            <Link
              href="/#tech-stack"
              className="block text-muted-foreground hover:text-foreground transition-colors py-1"
            >
              Tech Stack
            </Link>
            <Link
              href="/#architecture"
              className="block text-muted-foreground hover:text-foreground transition-colors py-1"
            >
              Architecture
            </Link>
            <div className="pt-2 border-t border-border flex flex-col gap-2">
              <AuthAwareButtons variant="nav" />
            </div>
          </MobileNavToggle>
        </div>
      </div>
    </nav>
  );
}
