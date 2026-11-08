'use client';

import Link from 'next/link';
import { Building2, BookOpen, ChevronRight, Combine, MapPin, Package, Percent, Receipt, Scale, UserCog } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/common/page';
import { useBusinessWorkspace } from '@/components/shell/ShellContext';
import { BUSINESS_PAGES } from '@/lib/navigation/business-tabs';
import { MEMBERS_COPY } from '@/lib/copy/members';

const SETTING_PAGES = [
  {
    key: 'business-details',
    href: '?tab=settings&page=business-details',
    label: 'Business Details',
    description: 'Name, address, and country information.',
    icon: Building2,
  },
  {
    key: 'chart-of-accounts',
    href: '?tab=settings&page=chart-of-accounts',
    label: 'Chart of Accounts',
    description: 'Manage your chart of accounts.',
    icon: BookOpen,
  },
  {
    key: 'starting-balances',
    href: '?tab=settings&page=starting-balances',
    label: 'Starting Balances',
    description: 'Opening balances of accounts, unpaid invoices and inventory on hand.',
    icon: Scale,
  },
  {
    key: 'tax-codes',
    href: '?tab=settings&page=tax-codes',
    label: 'Tax Codes',
    description: 'Tax rates used on sales lines.',
    icon: Percent,
  },
  {
    key: 'non-inventory-items',
    href: '?tab=settings&page=non-inventory-items',
    label: 'Non-inventory Items',
    description: 'Services and goods that fill sales lines.',
    icon: Package,
  },
  {
    key: 'inventory-kits',
    href: '?tab=settings&page=inventory-kits',
    label: 'Inventory Kits',
    description: 'Inventory items sold together as one line.',
    icon: Combine,
  },
  {
    key: 'inventory-locations',
    href: '?tab=settings&page=inventory-locations',
    label: 'Inventory Locations',
    description: 'Places where inventory items are kept.',
    icon: MapPin,
  },
  {
    key: 'sales',
    href: '?tab=settings&page=sales',
    label: 'Sales',
    description: 'What happens when an invoice goes over a credit limit.',
    icon: Receipt,
  },
];

// Members is a business page (?page=members), owner only; listed here so Settings is a complete index.
const MEMBERS_PAGE = {
  key: BUSINESS_PAGES.members,
  href: `?page=${BUSINESS_PAGES.members}`,
  label: MEMBERS_COPY.settingsLink,
  description: MEMBERS_COPY.settingsLinkDescription,
  icon: UserCog,
};

export default function BusinessSettings({ business }) {
  const { access } = useBusinessWorkspace();
  const pages = access?.is_owner ? [...SETTING_PAGES, MEMBERS_PAGE] : SETTING_PAGES;
  return (
    <>
      <PageHeader title="Settings" description={`Manage settings for ${business.name}.`} />
      <Card className="max-w-prose p-2">
        <ul>
          {pages.map(({ key, href, label, description, icon: Icon }) => (
            <li key={key} className="border-b border-row-divider last:border-b-0">
              <Link
                href={href}
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
