'use client';

import { GlobalProvider } from '@/lib/context/GlobalContext';

export function Providers({ children, initialAuth }) {
  return <GlobalProvider initialAuth={initialAuth}>{children}</GlobalProvider>;
}
