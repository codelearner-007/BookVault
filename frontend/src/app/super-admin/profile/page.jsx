import SuperAdminProfilePage from '@/components/super-admin/SuperAdminProfilePage';

export const metadata = {
  title: 'Profile | Super Admin',
};

export const dynamic = 'force-dynamic';

export default function ProfilePage() {
  return <SuperAdminProfilePage />;
}
