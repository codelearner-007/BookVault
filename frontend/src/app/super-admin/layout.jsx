import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Providers } from '@/components/common/Providers';
import AppShell from '@/components/shell/AppShell';
import { AdminClaimsProvider } from '@/components/admin/AdminClaimsContext';
import { getMe, getUserClaims } from '@/lib/server/me';
import { SIDEBAR_COOKIE, readSidebarState } from '@/lib/navigation/sidebar-state';

export const dynamic = 'force-dynamic';

const SUPER_ADMIN_ROLE = 'super_admin';

export default async function Layout({ children }) {
  const user = await getMe();

  if (!user) {
    redirect('/auth/login?returnTo=/super-admin');
  }

  const claims = getUserClaims(user);
  // Only super_admin users may access this section
  if (claims.user_role !== SUPER_ADMIN_ROLE) {
    redirect('/admin');
  }
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
