import { SiteNav } from '@/components/common/SiteNav';
import { SiteFooter } from '@/components/common/SiteFooter';

export default function PrivacyPage() {
  const sections = [
    {
      title: '1. Information We Collect',
      content:
        'We collect information that you provide directly to us, including your name, email address, and any other information you choose to provide when using our services.',
    },
    {
      title: '2. How We Use Your Information',
      content:
        'We use the information we collect to provide, maintain, and improve our services, communicate with you, and protect our users.',
    },
    {
      title: '3. Information Sharing',
      content:
        'We do not share your personal information with third parties except as described in this privacy policy or with your consent.',
    },
    {
      title: '4. Data Security',
      content:
        'We implement appropriate technical and organizational measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction.',
    },
    {
      title: '5. Your Rights',
      content:
        'You have the right to access, update, or delete your personal information at any time. You may also have additional rights depending on your location.',
    },
    {
      title: '6. Contact Us',
      content: `If you have any questions about this Privacy Policy, please contact us at privacy@example.com`,
    },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <SiteNav />

      <main className="flex-1 pt-24 pb-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-10">
            <h1 className="text-3xl font-bold tracking-tight">Privacy Policy</h1>
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
