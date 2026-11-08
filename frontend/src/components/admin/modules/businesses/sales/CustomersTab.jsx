'use client';

import { useSearchParams } from 'next/navigation';
import { useDocumentRoute, useTabRights } from '../banking/banking-parts';
import CustomerForm from './CustomerForm';
import CustomersList from './CustomersList';
import CustomerView from './CustomerView';
import { SALES_TABS } from './sales-documents';

// ?tab=customers  list (&q &p) · &new=1 · &edit=<id> · &view=<id> (&p pages its transactions)
export default function CustomersTab({ business }) {
  const route = useDocumentRoute(SALES_TABS.customers);
  const rights = useTabRights(SALES_TABS.customers);
  const searchParams = useSearchParams();

  if (route.isNew) return <CustomerForm businessId={business.id} allowed={rights.create} />;
  if (route.editId) return <CustomerForm key={route.editId} businessId={business.id} customerId={route.editId} allowed={rights.edit} />;
  if (route.viewId) return <CustomerView key={route.viewId} businessId={business.id} customerId={route.viewId} page={route.page} rights={rights} />;
  return (
    <CustomersList
      businessId={business.id}
      page={route.page}
      search={route.active ? searchParams.get('q') ?? '' : ''}
      active={route.active}
      canCreate={rights.create}
    />
  );
}
