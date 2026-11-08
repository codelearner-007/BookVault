import BusinessWorkspace from '@/components/admin/modules/businesses/BusinessWorkspace';

export const dynamic = 'force-dynamic';

// The business shell (sidebar, top bar) is the admin layout's AppShell; this renders the active tab.
export default function BusinessDetailPage() {
  return <BusinessWorkspace />;
}
