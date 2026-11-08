import { redirect } from 'next/navigation';
import { AdminPanelNav } from '@/components/super-admin/AdminPanelNav';
import { getMe, getUserClaims } from '@/lib/server/me';

export const dynamic = 'force-dynamic';

const SUPER_ADMIN_ROLE = 'super_admin';

// The Admin Panel lives inside the normal /admin shell; middleware also guards it (super_admin + AAL2).
export default async function AdminPanelLayout({ children }) {
  const claims = getUserClaims(await getMe());
  if (claims.user_role !== SUPER_ADMIN_ROLE) redirect('/admin');

  return (
    <>
      <AdminPanelNav />
      {children}
    </>
  );
}
