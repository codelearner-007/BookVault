import AdminAuditPage from '@/components/admin/AdminAuditPage';

export const metadata = {
  title: 'My Activity | Admin',
};

export const dynamic = 'force-dynamic';

export default function AuditPage() {
  return <AdminAuditPage />;
}
