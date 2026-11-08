'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { setCookie, getCookie } from 'cookies-next/client';
import { Button } from '@/components/ui/button';
import { COOKIE_COPY as COPY } from '@/lib/copy/cookies';

const COOKIE_CONSENT_KEY = 'cookie-accept';
const COOKIE_EXPIRY_DAYS = 365;
const SHOW_DELAY_MS = 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
// The page reserves the banner's height at its bottom (globals.css), so the banner never hides a form's
// last field or button on a phone.
const SPACE_VAR = '--cookie-banner-space';

function useReservedSpace(ref, visible) {
  useEffect(() => {
    const root = document.documentElement;
    if (!visible || !ref.current) {
      root.style.removeProperty(SPACE_VAR);
      return undefined;
    }
    const observer = new ResizeObserver(([entry]) => {
      root.style.setProperty(SPACE_VAR, `${Math.ceil(entry.borderBoxSize[0].blockSize)}px`);
    });
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      root.style.removeProperty(SPACE_VAR);
    };
  }, [ref, visible]);
}

export default function CookieConsent() {
  const [isVisible, setIsVisible] = useState(false);
  const banner = useRef(null);
  useReservedSpace(banner, isVisible);

  useEffect(() => {
    if (getCookie(COOKIE_CONSENT_KEY)) return undefined;
    const timer = setTimeout(() => setIsVisible(true), SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  const setConsent = (value) => {
    setCookie(COOKIE_CONSENT_KEY, value, {
      expires: new Date(Date.now() + COOKIE_EXPIRY_DAYS * MS_PER_DAY),
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div ref={banner} className="pointer-events-none fixed inset-x-0 bottom-0 z-50 p-3">
      <section
        aria-label={COPY.label}
        className="pointer-events-auto mx-auto flex max-w-2xl flex-col gap-3 rounded-card border border-popover-border bg-popover p-4 text-sm text-popover-foreground shadow-pop sm:flex-row sm:items-center"
      >
        <p className="flex-1 text-muted-foreground">
          {COPY.body}{' '}
          <Link href="/privacy" className="font-medium text-link underline-offset-4 hover:underline">{COPY.privacy}</Link>
        </p>
        <div className="flex shrink-0 gap-2">
          <Button variant="ghost" size="sm" onClick={() => setConsent('declined')}>{COPY.decline}</Button>
          <Button variant="secondary" size="sm" onClick={() => setConsent('accepted')}>{COPY.accept}</Button>
        </div>
      </section>
    </div>
  );
}
