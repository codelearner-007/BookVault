'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { User, Key, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ProfileSection } from './ProfileSection';
import { PasswordSection } from './PasswordSection';
import { SecuritySection } from './SecuritySection';

const menuItems = [
  {
    id: 'profile',
    label: 'Profile',
    icon: User,
    description: 'Personal details',
  },
  {
    id: 'password',
    label: 'Password',
    icon: Key,
    description: 'Update credentials',
  },
  {
    id: 'security',
    label: 'Security',
    icon: Shield,
    description: 'Two-factor auth',
  },
];

export function UserSettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeSection, setActiveSection] = useState('profile');

  useEffect(() => {
    const section = searchParams.get('section');
    if (section && ['profile', 'password', 'security'].includes(section)) {
      setActiveSection(section);
    }
  }, [searchParams]);

  const handleSectionChange = (section) => {
    setActiveSection(section);
    router.push(`/app/user-settings?section=${section}`, { scroll: false });
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Account Settings
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage your profile, security, and account preferences.
        </p>
      </div>

      <Separator className="my-6" />

      <div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
        {/* Navigation sidebar */}
        <aside className="lg:w-64 flex-shrink-0">
          <nav className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0">
            {menuItems.map((item) => (
              <Button
                key={item.id}
                variant="ghost"
                onClick={() => handleSectionChange(item.id)}
                className={cn(
                  'justify-start gap-3 h-auto py-3 px-4 rounded-lg transition-all whitespace-nowrap',
                  activeSection === item.id
                    ? 'bg-primary/10 text-primary hover:bg-primary/15 font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                )}
              >
                <item.icon className={cn("h-4 w-4", activeSection === item.id ? "text-primary" : "text-muted-foreground")} />
                <span className="flex-1 text-left">{item.label}</span>
              </Button>
            ))}
          </nav>
        </aside>

        {/* Content area */}
        <div className="flex-1 min-w-0">
          <div className="space-y-6">
             {/* Section Header */}
             <div>
                <h2 className="text-lg font-medium">
                  {menuItems.find(i => i.id === activeSection)?.label}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {menuItems.find(i => i.id === activeSection)?.description}
                </p>
             </div>
             <Separator />

            {activeSection === 'profile' && <ProfileSection />}
            {activeSection === 'password' && <PasswordSection />}
            {activeSection === 'security' && <SecuritySection />}
          </div>
        </div>
      </div>
    </div>
  );
}
