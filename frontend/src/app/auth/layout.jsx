import Link from 'next/link';
import { ArrowLeft, Shield, Key, LayoutDashboard, ScrollText } from 'lucide-react';
import { Providers } from '@/components/common/Providers';

export default function AuthLayout({ children }) {
  const productName = process.env.NEXT_PUBLIC_PRODUCTNAME || 'SaaS Starter';

  const highlights = [
    {
      icon: Shield,
      title: 'Authentication & MFA',
      description: 'Email/password, SSO providers, and TOTP multi-factor authentication built in.',
    },
    {
      icon: Key,
      title: 'Role-Based Access Control',
      description: 'Granular permissions across 4 modules with hierarchical role support.',
    },
    {
      icon: LayoutDashboard,
      title: 'Admin Dashboard',
      description: 'Full-featured admin panel with user management and system settings.',
    },
    {
      icon: ScrollText,
      title: 'Audit Trail',
      description: 'Comprehensive logging with advanced filtering and export capabilities.',
    },
  ];

  return (
    <div className="flex min-h-screen">
      <div className="w-full lg:w-1/2 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 bg-background relative">
        <Link
          href="/"
          className="absolute left-8 top-8 flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Homepage
        </Link>

        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <h2 className="text-center text-3xl font-bold tracking-tight text-foreground">
            {productName}
          </h2>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <Providers>{children}</Providers>
        </div>
      </div>

      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary to-primary/80">
        <div className="w-full flex items-center justify-center p-12">
          <div className="max-w-md">
            <h3 className="text-primary-foreground text-2xl font-bold mb-2">
              Production-Ready SaaS Starter
            </h3>
            <p className="text-primary-foreground/70 text-sm mb-8">
              Built with Next.js 16, FastAPI, Supabase, and Tailwind CSS v4.
            </p>

            <div className="space-y-5">
              {highlights.map((item) => (
                <div
                  key={item.title}
                  className="flex items-start gap-4 bg-primary-foreground/5 backdrop-blur-sm rounded-xl p-4 border border-primary-foreground/10"
                >
                  <div className="p-2 rounded-lg bg-primary-foreground/10 shrink-0">
                    <item.icon className="h-5 w-5 text-primary-foreground" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-primary-foreground">
                      {item.title}
                    </h4>
                    <p className="text-sm text-primary-foreground/70 mt-0.5 leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 pt-6 border-t border-primary-foreground/10 text-center">
              <p className="text-primary-foreground/60 text-xs">
                Open source starter template for building SaaS applications
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
