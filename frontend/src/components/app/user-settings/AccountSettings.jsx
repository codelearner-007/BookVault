'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Shield, User } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/common/page';
import { ProfileSection } from './ProfileSection';
import { SecuritySection } from './SecuritySection';
import { AUTH_UI_COPY } from '@/lib/copy/auth-ui';

const COPY = AUTH_UI_COPY.account;
const TABS = { profile: 'profile', security: 'security' };
// Old links (?tab=password) open Security, where the password now lives.
const TAB_ALIASES = { password: TABS.security };

// The account page of /admin/profile and /super-admin/profile: Profile and Security tabs.
export function AccountSettings({ basePath }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requested = searchParams.get('tab');
  const activeTab = TAB_ALIASES[requested] ?? (Object.values(TABS).includes(requested) ? requested : TABS.profile);

  return (
    <div>
      <PageHeader title={COPY.title} description={COPY.description} />
      <Tabs value={activeTab} onValueChange={(tab) => router.push(`${basePath}?tab=${tab}`, { scroll: false })}>
        <TabsList>
          <TabsTrigger value={TABS.profile}>
            <User className="size-4" aria-hidden="true" />
            {COPY.profileTab}
          </TabsTrigger>
          <TabsTrigger value={TABS.security}>
            <Shield className="size-4" aria-hidden="true" />
            {COPY.securityTab}
          </TabsTrigger>
        </TabsList>
        <TabsContent value={TABS.profile} className="mt-6">
          <ProfileSection />
        </TabsContent>
        <TabsContent value={TABS.security} className="mt-6">
          <SecuritySection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
