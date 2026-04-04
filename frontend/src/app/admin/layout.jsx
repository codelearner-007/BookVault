import { redirect } from 'next/navigation';
import { Providers } from '@/components/common/Providers';
import AdminShellLayout from '@/components/admin/AdminShellLayout';
import { AdminClaimsProvider } from '@/components/admin/AdminClaimsContext';
import { getMe, getUserClaims } from '@/lib/server/me';

export const dynamic = 'force-dynamic';

export default async function Layout({ children }) {
  const user = await getMe();

  if (!user) {
    redirect('/auth/login?returnTo=/admin');
  }

  const claims = getUserClaims(user);

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
        <AdminShellLayout>{children}</AdminShellLayout>
      </AdminClaimsProvider>
    </Providers>
  );
}
