'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { User, Key, Shield } from 'lucide-react';
import { ProfileSection } from '@/components/app/user-settings/ProfileSection';
import { PasswordSection } from '@/components/app/user-settings/PasswordSection';
import { SecuritySection } from '@/components/app/user-settings/SecuritySection';

export default function AdminProfilePage() {
  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Profile</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your profile, password, and security settings
        </p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="profile" className="gap-2">
            <User className="h-4 w-4" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="password" className="gap-2">
            <Key className="h-4 w-4" />
            Password
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-2">
            <Shield className="h-4 w-4" />
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
