import PlatformAuditPage from '@/components/super-admin/PlatformAuditPage';

export const metadata = {
  title: 'Platform audit | Admin Panel',
};

export const dynamic = 'force-dynamic';

export default function Page() {
  return <PlatformAuditPage />;
}
