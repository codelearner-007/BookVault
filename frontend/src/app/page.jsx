import Link from 'next/link';
import {
  ArrowRight,
  Shield,
  Users,
  Key,
  LayoutDashboard,
  ScrollText,
  Code2,
  Zap,
  Lock,
  Github,
  Layers,
  Database,
  Palette,
  FileCode2,
  Server,
  Workflow,
  CheckCircle2,
  Terminal,
  Cpu,
  Globe,
  Rocket,
} from 'lucide-react';
import AuthAwareButtons from '@/components/common/AuthAwareButtons';
import { SiteNav } from '@/components/common/SiteNav';
import { SiteFooter } from '@/components/common/SiteFooter';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const metadata = {
  title: 'Home',
  description: 'A production-ready SaaS starter template with authentication, RBAC, admin panel, and audit logs.',
};

export default function Home() {
  const features = [
    {
      icon: Shield,
      title: 'Enterprise Auth',
      description: 'Production-ready authentication with MFA, social logins, and session management.',
      className: 'md:col-span-2',
      bg: 'bg-blue-500/10',
      text: 'text-blue-500',
    },
    {
      icon: LayoutDashboard,
      title: 'Admin Dashboard',
      description: 'Full-featured admin panel to manage users and system settings.',
      className: 'md:col-span-1',
      bg: 'bg-purple-500/10',
      text: 'text-purple-500',
    },
    {
      icon: Key,
      title: 'RBAC System',
      description: 'Granular role-based access control with hierarchical permissions.',
      className: 'md:col-span-1',
      bg: 'bg-orange-500/10',
      text: 'text-orange-500',
    },
    {
      icon: ScrollText,
      title: 'Audit Logging',
      description: 'Comprehensive audit trails for security and compliance.',
      className: 'md:col-span-2',
      bg: 'bg-green-500/10',
      text: 'text-green-500',
    },
  ];

  const techStack = [
    { name: 'Next.js 16', description: 'App Router', icon: Layers },
    { name: 'React 19', description: 'Server Components', icon: Code2 },
    { name: 'Tailwind v4', description: 'Utility-first CSS', icon: Palette },
    { name: 'JavaScript', description: 'Modern JS', icon: FileCode2 },
    { name: 'FastAPI', description: 'High Performance', icon: Zap },
    { name: 'SQLAlchemy', description: 'Async ORM', icon: Database },
    { name: 'Supabase', description: 'PostgreSQL + Auth', icon: Server },
    { name: 'shadcn/ui', description: 'Beautiful UI', icon: Workflow },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background selection:bg-primary/20">
      <SiteNav />
      <main className="flex-1">

        {/* Hero Section */}
        <section className="relative pt-32 pb-20 md:pt-48 md:pb-32 overflow-hidden">
          {/* Background Effects */}
          <div className="absolute inset-0 -z-10 h-full w-full bg-background bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:14px_24px]">
            <div className="absolute left-0 right-0 top-0 -z-10 m-auto h-[310px] w-[310px] rounded-full bg-primary/20 opacity-20 blur-[100px]"></div>
          </div>

          <div className="container px-4 md:px-6 mx-auto relative z-10">
            <div className="flex flex-col items-center text-center max-w-4xl mx-auto space-y-8">
              <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-sm font-medium text-primary backdrop-blur-sm">
                <Rocket className="mr-2 h-3.5 w-3.5" />
                <span>v1.0 is now live</span>
                <span className="mx-2 h-4 w-[1px] bg-primary/20"></span>
                <span className="text-muted-foreground">Open Source</span>
              </div>

              <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight text-foreground">
                Ship your SaaS <br className="hidden md:block" />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary/60">
                  in days, not months
                </span>
              </h1>

              <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                The ultimate production-ready starter kit.
                Next.js 16, FastAPI, Supabase, and everything else you need to build a modern SaaS application.
              </p>

              <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
                <AuthAwareButtons />
                <Button variant="outline" size="lg" asChild className="w-full sm:w-auto">
                  <Link href="https://github.com/code-by-muhammad" target="_blank" rel="noopener noreferrer">
                    <Github className="mr-2 h-4 w-4" />
                    Star on GitHub
                  </Link>
                </Button>
              </div>

              {/* Code Preview / Dashboard Mockup */}
              <div className="mt-16 relative w-full max-w-5xl mx-auto [perspective:2000px]">
                <div className="relative rounded-xl border border-border/50 bg-background/50 backdrop-blur-xl shadow-2xl overflow-hidden [transform:rotateX(12deg)] transition-transform duration-500 hover:[transform:rotateX(0deg)] group">
                  <div className="absolute inset-0 bg-gradient-to-tr from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                  {/* Window Controls */}
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50 bg-muted/30">
                    <div className="h-3 w-3 rounded-full bg-red-500/20 border border-red-500/50" />
                    <div className="h-3 w-3 rounded-full bg-yellow-500/20 border border-yellow-500/50" />
                    <div className="h-3 w-3 rounded-full bg-green-500/20 border border-green-500/50" />
                  </div>

                  {/* Content Mockup */}
                  <div className="p-6 md:p-8 grid gap-6 md:grid-cols-3">
                    {/* Sidebar Mockup */}
                    <div className="hidden md:flex flex-col gap-4 border-r border-border/50 pr-6">
                      <div className="h-8 w-3/4 bg-muted rounded animate-pulse" />
                      <div className="space-y-2 mt-4">
                        <div className="h-4 w-full bg-muted/50 rounded" />
                        <div className="h-4 w-5/6 bg-muted/50 rounded" />
                        <div className="h-4 w-4/6 bg-muted/50 rounded" />
                      </div>
                    </div>

                    {/* Main Content Mockup */}
                    <div className="md:col-span-2 space-y-6">
                      <div className="flex items-center justify-between">
                        <div className="h-8 w-1/3 bg-muted rounded animate-pulse" />
                        <div className="h-8 w-24 bg-primary/20 rounded" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="h-32 rounded-lg bg-muted/30 border border-border/50 p-4 space-y-3">
                          <div className="h-8 w-8 rounded bg-primary/10" />
                          <div className="h-4 w-1/2 bg-muted rounded" />
                          <div className="h-6 w-1/3 bg-muted rounded" />
                        </div>
                        <div className="h-32 rounded-lg bg-muted/30 border border-border/50 p-4 space-y-3">
                          <div className="h-8 w-8 rounded bg-green-500/10" />
                          <div className="h-4 w-1/2 bg-muted rounded" />
                          <div className="h-6 w-1/3 bg-muted rounded" />
                        </div>
                      </div>
                      <div className="h-48 rounded-lg bg-muted/20 border border-border/50" />
                    </div>
                  </div>
                </div>

                {/* Glow Effect */}
                <div className="absolute -inset-4 bg-primary/20 blur-3xl -z-10 opacity-30" />
              </div>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="py-24 bg-muted/30 relative overflow-hidden">
          <div className="container px-4 md:px-6 mx-auto">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <h2 className="text-3xl font-bold tracking-tight mb-4">Everything you need to ship</h2>
              <p className="text-muted-foreground text-lg">
                Stop rebuilding auth, payments, and admin panels. Focus on your unique value proposition.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
              {features.map((feature, i) => (
                <div
                  key={i}
                  className={cn(
                    "group relative overflow-hidden rounded-2xl border border-border/50 bg-background p-8 transition-all hover:shadow-lg hover:border-primary/20",
                    feature.className
                  )}
                >
                  <div className={cn(
                    "mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl transition-colors",
                    feature.bg,
                    feature.text
                  )}>
                    <feature.icon className="h-6 w-6" />
                  </div>
                  <h3 className="mb-2 text-xl font-bold">{feature.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">{feature.description}</p>

                  {/* Hover Gradient */}
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Tech Stack */}
        <section className="py-24 border-y border-border/50 bg-background">
          <div className="container px-4 md:px-6 mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-2xl font-bold tracking-tight mb-2">Built with modern standards</h2>
              <p className="text-muted-foreground">
                Best-in-class technologies for reliability and scale.
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-5xl mx-auto">
              {techStack.map((tech, i) => (
                <div key={i} className="flex flex-col items-center text-center group p-4 rounded-xl hover:bg-muted/50 transition-colors">
                  <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                    <tech.icon className="h-6 w-6 text-foreground/80" />
                  </div>
                  <h3 className="font-semibold">{tech.name}</h3>
                  <p className="text-sm text-muted-foreground">{tech.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-24 relative overflow-hidden">
          <div className="container px-4 md:px-6 mx-auto">
            <div className="relative rounded-3xl overflow-hidden bg-primary px-6 py-16 md:px-16 md:py-20 text-center shadow-2xl">
              {/* Background Pattern */}
              <div className="absolute inset-0 opacity-10">
                <svg className="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                  <path d="M0 100 C 20 0 50 0 100 100 Z" fill="white" />
                </svg>
              </div>

              <div className="relative z-10 max-w-3xl mx-auto space-y-8">
                <h2 className="text-3xl md:text-5xl font-bold text-primary-foreground tracking-tight">
                  Ready to launch your next big idea?
                </h2>
                <p className="text-lg text-primary-foreground/80 max-w-2xl mx-auto">
                  Get started with our production-ready template today. Save months of development time and focus on what matters.
                </p>
                <div className="flex flex-col sm:flex-row justify-center gap-4 pt-4">
                  <Button size="lg" variant="secondary" asChild className="h-12 px-8 text-base">
                    <Link href="/auth/register">
                      Get Started Now
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                  <Button size="lg" variant="outline" asChild className="h-12 px-8 text-base bg-transparent text-primary-foreground border-primary-foreground/20 hover:bg-primary-foreground/10 hover:text-primary-foreground">
                    <Link href="https://github.com/code-by-muhammad" target="_blank">
                      <Github className="mr-2 h-4 w-4" />
                      View Source
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>

      </main>
      <SiteFooter />
    </div>
  );
}
