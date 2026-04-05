import BusinessesPage from '@/components/admin/modules/businesses/BusinessesPage';

export const metadata = { title: 'Businesses | Admin' };
export const dynamic = 'force-dynamic';

export default function Page() {
  return <BusinessesPage />;
}
