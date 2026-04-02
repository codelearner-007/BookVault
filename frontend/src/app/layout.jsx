import { Inter } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import { Analytics } from '@vercel/analytics/next';
import CookieConsent from "@/components/common/Cookies";
import { GoogleAnalytics } from '@next/third-parties/google';
import ToastMount from '@/components/common/ToastMount';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
});

const productName = process.env.NEXT_PUBLIC_PRODUCTNAME || 'SaaS Starter';

export const metadata = {
  title: {
    default: productName,
    template: `%s | ${productName}`,
  },
  description: "A production-ready SaaS starter with authentication, RBAC, admin panel, and audit logs.",
};

export default function RootLayout({ children }) {
  const gaID = process.env.NEXT_PUBLIC_GOOGLE_TAG;
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
    <body className={inter.className} suppressHydrationWarning>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-4 focus:left-4 focus:px-4 focus:py-2 focus:bg-background focus:text-foreground focus:rounded-md focus:ring-2 focus:ring-ring focus:outline-none"
      >
        Skip to main content
      </a>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        {children}
      </ThemeProvider>
      <ToastMount />
      <Analytics />
      <CookieConsent />
      {gaID && <GoogleAnalytics gaId={gaID} />}
    </body>
    </html>
  );
}
