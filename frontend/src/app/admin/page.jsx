import AdminHomePage from '@/components/admin/AdminHomePage';

export const metadata = {
  title: 'Dashboard | Admin',
};

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  return <AdminHomePage />;
}
