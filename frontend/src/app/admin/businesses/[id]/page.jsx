'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { getBusiness, listBusinessTabs } from '@/lib/services/business.service';
import BusinessShellLayout from '@/components/admin/modules/businesses/BusinessShellLayout';

function BusinessPageSkeleton() {
  return (
    <div className="fixed inset-0 z-40 bg-background flex">
      {/* Sidebar skeleton */}
      <aside className="w-64 bg-card border-r border-border flex-shrink-0 flex flex-col hidden lg:flex">
        <div className="h-14 flex items-center px-4 border-b border-border/60">
          <Skeleton className="h-7 w-24" />
        </div>
        <div className="px-4 py-4 border-b border-border/60">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-1.5 min-w-0">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        </div>
        <div className="flex-1 py-4 px-3 space-y-1">
          <Skeleton className="h-3 w-16 mb-3 ml-2" />
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-9 w-full rounded-lg" />
          ))}
        </div>
      </aside>

      {/* Mobile top bar skeleton */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-10 flex items-center h-14 bg-card/80 border-b border-border px-4 gap-3">
        <Skeleton className="h-8 w-8 rounded-md" />
        <Skeleton className="h-8 w-8 rounded-full" />
        <Skeleton className="h-4 w-32" />
      </div>

      {/* Content skeleton */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 p-6 lg:p-8 overflow-auto pt-20 lg:pt-6">
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="space-y-2">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-4 w-72" />
            </div>
            <Skeleton className="h-48 w-full rounded-lg" />
            <Skeleton className="h-32 w-full rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BusinessDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [business, setBusiness] = useState(null);
  const [initialTabs, setInitialTabs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [businessData, tabsData] = await Promise.all([
          getBusiness(id),
          listBusinessTabs(id).catch(() => ({ items: [] })),
        ]);
        if (businessData?.id) {
          setBusiness(businessData);
          setInitialTabs(tabsData?.items ?? []);
        } else {
          router.replace('/admin/businesses');
        }
      } catch {
        router.replace('/admin/businesses');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id, router]);

  if (loading) return <BusinessPageSkeleton />;
  if (!business) return null;

  return (
    <BusinessShellLayout
      business={business}
      initialTabs={initialTabs}
      onBack={() => router.push('/admin/businesses')}
    />
  );
}
