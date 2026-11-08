import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Providers } from '@/components/common/Providers';
import AppShell from '@/components/shell/AppShell';
import { AdminClaimsProvider } from '@/components/admin/AdminClaimsContext';
import { getMe, getUserClaims } from '@/lib/server/me';
import { SIDEBAR_COOKIE, readSidebarState } from '@/lib/navigation/sidebar-state';

export const dynamic = 'force-dynamic';

export default async function Layout({ children }) {
  const user = await getMe();

  if (!user) {
    redirect('/auth/login?returnTo=/admin');
  }

  const claims = getUserClaims(user);
  const sidebar = readSidebarState((await cookies()).get(SIDEBAR_COOKIE)?.value);

  return (
    <Providers
      initialAuth={{
        user: {
          id: user.id,
          email: user.email,
          created_at: user.created_at || new Date().toISOString(),
          user_metadata: user.user_metadata,
          app_metadata: user.app_metadata,
        },
        mfaRequired: user.requiresMFA,
      }}
    >
      <AdminClaimsProvider claims={claims}>
        <AppShell role={claims.user_role} initialSidebar={sidebar}>
          {children}
        </AppShell>
      </AdminClaimsProvider>
    </Providers>
  );
}
