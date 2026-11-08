import SuperAdminUsersPage from '@/components/super-admin/SuperAdminUsersPage';

export const metadata = {
  title: 'Users and admins | Super Admin',
};

export const dynamic = 'force-dynamic';

export default function UsersPage() {
  return <SuperAdminUsersPage />;
}
