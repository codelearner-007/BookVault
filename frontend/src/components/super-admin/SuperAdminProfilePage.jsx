'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { ProfileSection } from '@/components/app/user-settings/ProfileSection';
import { PasswordSection } from '@/components/app/user-settings/PasswordSection';
import { SecuritySection } from '@/components/app/user-settings/SecuritySection';

const VALID_TABS = ['profile', 'password', 'security'];

export default function SuperAdminProfilePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState('profile');

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && VALID_TABS.includes(tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    router.push(`/super-admin/profile?tab=${tab}`, { scroll: false });
  };

  return (
    <div className="max-w-4xl space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Profile Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your profile, password, and security settings.
        </p>
      </div>

      <Separator />

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className="bg-muted/50 border border-border">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="password">Password</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-6">
          <div>
            <h2 className="text-lg font-medium text-foreground">Profile</h2>
            <p className="text-sm text-muted-foreground">Personal details</p>
          </div>
          <Separator />
          <ProfileSection />
        </TabsContent>

        <TabsContent value="password" className="space-y-6">
          <div>
            <h2 className="text-lg font-medium text-foreground">Password</h2>
            <p className="text-sm text-muted-foreground">Update credentials</p>
          </div>
          <Separator />
          <PasswordSection />
        </TabsContent>

        <TabsContent value="security" className="space-y-6">
          <div>
            <h2 className="text-lg font-medium text-foreground">Security</h2>
            <p className="text-sm text-muted-foreground">Two-factor authentication</p>
          </div>
          <Separator />
          <SecuritySection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
