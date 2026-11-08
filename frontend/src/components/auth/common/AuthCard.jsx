import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LogoWordmark } from '@/components/common/logo';
import { BRAND } from '@/lib/copy/brand';

export function Wordmark() {
  return (
    <Link href="/" aria-label={BRAND.home} className="inline-flex min-h-control items-center rounded-control text-foreground">
      <LogoWordmark className="h-6" />
    </Link>
  );
}

/*
  The auth card of design sample a-nightglass/login.html: wordmark, centred title and lede,
  the form, an alternative link and an optional quiet note. `icon` marks a state screen.
*/
export function AuthCard({ title, lede, icon: Icon, children, alt, note, className }) {
  return (
    <div
      className={cn(
        'glass w-full max-w-md rounded-card border border-card-border p-10 shadow-card max-md:p-6',
        className,
      )}
    >
      <div className="mb-6 flex justify-center">
        <Wordmark />
      </div>
      {Icon && (
        <div className="mb-4 flex justify-center">
          <Icon className="size-6 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
        </div>
      )}
      <h1 className="text-center text-xl font-bold tracking-title text-balance">{title}</h1>
      {lede && <p className="mb-8 mt-2 text-center text-sm text-muted-foreground text-pretty">{lede}</p>}
      {!lede && <div className="mb-8" />}
      {children}
      {alt && <div className="mt-6 text-center text-sm text-muted-foreground">{alt}</div>}
      {note && (
        <p className="mt-6 flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="mt-px size-4 shrink-0" aria-hidden="true" />
          <span>{note}</span>
        </p>
      )}
    </div>
  );
}

// A text link inside auth copy ("Forgot password?", "Create an account").
export function AuthLink({ href, children, className }) {
  return (
    <Link
      href={href}
      className={cn('font-medium text-link underline-offset-4 hover:underline', className)}
    >
      {children}
    </Link>
  );
}
