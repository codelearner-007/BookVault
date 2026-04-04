import { redirect } from 'next/navigation';
import { Providers } from '@/components/common/Providers';
import SuperAdminShellLayout from '@/components/super-admin/SuperAdminShellLayout';
import { getMe } from '@/lib/server/me';

export const dynamic = 'force-dynamic';

export default async function Layout({ children }) {
  const user = await getMe();

  if (!user) {
    redirect('/auth/login?returnTo=/super-admin');
  }

  // Only super_admin users may access this section
  if (user.app_metadata?.user_role !== 'super_admin') {
    redirect('/app');
  }

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
      <SuperAdminShellLayout>{children}</SuperAdminShellLayout>
    </Providers>
  );
}
