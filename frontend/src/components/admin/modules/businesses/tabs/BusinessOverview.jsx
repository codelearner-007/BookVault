'use client';

import { Building2, Users, Settings, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

function StatCard({ icon: Icon, label, value, loading }) {
  return (
    <Card className="border-border">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
              {label}
            </p>
            {loading ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              <p className="text-2xl font-bold text-foreground">{value}</p>
            )}
          </div>
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Icon className="h-4 w-4 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function BusinessOverview({ business }) {
  const stats = [
    { icon: Users, label: 'Members', value: '—' },
    { icon: TrendingUp, label: 'Activity', value: '—' },
    { icon: Settings, label: 'Integrations', value: '—' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">{business.name}</h2>
        {business.country && (
          <p className="text-sm text-muted-foreground mt-0.5">{business.country}</p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stats.map((stat) => (
          <StatCard key={stat.label} {...stat} loading={false} />
        ))}
      </div>

      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Business Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-border/60">
            <span className="text-sm text-muted-foreground">Name</span>
            <span className="text-sm font-medium text-foreground">{business.name}</span>
          </div>
          {business.country && (
            <div className="flex items-center justify-between py-2 border-b border-border/60">
              <span className="text-sm text-muted-foreground">Country</span>
              <span className="text-sm font-medium text-foreground">{business.country}</span>
            </div>
          )}
          {business.created_at && (
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-muted-foreground">Created</span>
              <span className="text-sm font-medium text-foreground tabular-nums">
                {new Intl.DateTimeFormat('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                }).format(new Date(business.created_at))}
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
