import AdminDashboardPage from '@/components/admin/AdminDashboardPage';

export const metadata = {
  title: 'Dashboard | Admin',
};

export const dynamic = 'force-dynamic';

export default function AdminPage() {
  return <AdminDashboardPage />;
}
