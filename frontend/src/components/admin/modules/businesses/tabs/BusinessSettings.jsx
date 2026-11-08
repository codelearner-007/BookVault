'use client';

import Link from 'next/link';
import { Building2, BookOpen, ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/common/page';

const SETTING_PAGES = [
  {
    key: 'business-details',
    label: 'Business Details',
    description: 'Name, address, and country information.',
    icon: Building2,
  },
  {
    key: 'chart-of-accounts',
    label: 'Chart of Accounts',
    description: 'Manage your chart of accounts.',
    icon: BookOpen,
  },
];

export default function BusinessSettings({ business }) {
  return (
    <>
      <PageHeader title="Settings" description={`Manage settings for ${business.name}.`} />
      <Card className="max-w-prose p-2">
        <ul>
          {SETTING_PAGES.map(({ key, label, description, icon: Icon }) => (
            <li key={key} className="border-b border-row-divider last:border-b-0">
              <Link
                href={`?tab=settings&page=${key}`}
                className="flex items-center gap-4 rounded-control px-3 py-3 transition-colors duration-150 hover:bg-row-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <Icon className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{label}</span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">{description}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
