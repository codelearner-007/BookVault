import AdminProfilePage from '@/components/admin/AdminProfilePage';

export const metadata = {
  title: 'Profile | Admin',
};

export const dynamic = 'force-dynamic';

export default function ProfilePage() {
  return <AdminProfilePage />;
}
