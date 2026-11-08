'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { User, Key, Shield } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/common/page';
import { ProfileSection } from '@/components/app/user-settings/ProfileSection';
import { PasswordSection } from '@/components/app/user-settings/PasswordSection';
import { SecuritySection } from '@/components/app/user-settings/SecuritySection';

const VALID_TABS = ['profile', 'password', 'security'];

export default function AdminProfilePage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tabParam = searchParams.get('tab');
  const activeTab = VALID_TABS.includes(tabParam) ? tabParam : 'profile';

  const handleTabChange = (tab) => {
    router.push(`/admin/profile?tab=${tab}`, { scroll: false });
  };

  return (
    <div>
      <PageHeader title="Account" description="Manage your profile, password, and security settings" />

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="profile">
            <User className="size-4" aria-hidden="true" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="password">
            <Key className="size-4" aria-hidden="true" />
            Password
          </TabsTrigger>
          <TabsTrigger value="security">
            <Shield className="size-4" aria-hidden="true" />
            Security
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-6">
          <ProfileSection />
        </TabsContent>

        <TabsContent value="password" className="mt-6">
          <PasswordSection />
        </TabsContent>

        <TabsContent value="security" className="mt-6">
          <SecuritySection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
