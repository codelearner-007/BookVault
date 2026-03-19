import { SiteNav } from '@/components/common/SiteNav';
import { SiteFooter } from '@/components/common/SiteFooter';

export default function TermsPage() {
  const sections = [
    {
      title: '1. Acceptance of Terms',
      content:
        'By accessing and using this service, you accept and agree to be bound by the terms and provision of this agreement.',
    },
    {
      title: '2. Use License',
      content:
        'Permission is granted to temporarily use this service for personal, non-commercial use only. This is the grant of a license, not a transfer of title.',
    },
    {
      title: '3. User Responsibilities',
      content:
        'You are responsible for maintaining the confidentiality of your account and password and for restricting access to your account. You agree to accept responsibility for all activities that occur under your account.',
    },
    {
      title: '4. Prohibited Uses',
      content:
        'You may not use our service for any illegal or unauthorized purpose. You must not violate any laws in your jurisdiction when using our service.',
    },
    {
      title: '5. Termination',
      content:
        'We may terminate or suspend your account and access to the service immediately, without prior notice or liability, for any reason whatsoever, including without limitation if you breach the Terms.',
    },
    {
      title: '6. Limitation of Liability',
      content:
        'In no event shall we be liable for any indirect, incidental, special, consequential or punitive damages resulting from your use of or inability to use the service.',
    },
    {
      title: '7. Contact Information',
      content:
        'If you have any questions about these Terms, please contact us at terms@example.com',
    },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <SiteNav />

      <main className="flex-1 pt-24 pb-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-10">
            <h1 className="text-3xl font-bold tracking-tight">Terms of Service</h1>
            <p className="text-sm text-muted-foreground mt-2">
              Last updated: {new Date().toLocaleDateString()}
            </p>
          </div>

          <div className="space-y-8">
            {sections.map((section) => (
              <section key={section.title}>
                <h2 className="text-lg font-semibold mb-3">{section.title}</h2>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {section.content}
                </p>
              </section>
            ))}
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
