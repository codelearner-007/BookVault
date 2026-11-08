import PlatformAuditPage from '@/components/super-admin/PlatformAuditPage';

export const metadata = {
  title: 'Platform audit | Super Admin',
};

export const dynamic = 'force-dynamic';

export default function Page() {
  return <PlatformAuditPage />;
}
