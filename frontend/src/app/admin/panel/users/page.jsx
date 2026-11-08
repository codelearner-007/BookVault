import SuperAdminUsersPage from '@/components/super-admin/SuperAdminUsersPage';

export const metadata = {
  title: 'Users and admins | Admin Panel',
};

export const dynamic = 'force-dynamic';

export default function UsersPage() {
  return <SuperAdminUsersPage />;
}
