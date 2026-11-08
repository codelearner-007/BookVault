import { Manrope } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import { Analytics } from '@vercel/analytics/next';
import CookieConsent from "@/components/common/Cookies";
import { GoogleAnalytics } from '@next/third-parties/google';
import ToastMount from '@/components/common/ToastMount';
import { BRAND } from '@/lib/copy/brand';

// Self-hosted at build time by next/font; only the weights the design system uses.
const manrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-manrope',
});

// Icons come from app/icon.svg, app/apple-icon.png and app/favicon.ico (the logo mark).
export const metadata = {
  title: {
    default: BRAND.name,
    template: `%s | ${BRAND.name}`,
  },
  description: BRAND.description,
};

export default function RootLayout({ children }) {
  const gaID = process.env.NEXT_PUBLIC_GOOGLE_TAG;
  return (
    <html lang="en" className={manrope.variable} suppressHydrationWarning>
    <body className="font-sans" suppressHydrationWarning>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-4 focus:left-4 focus:px-4 focus:py-2 focus:bg-background focus:text-foreground focus:rounded-control focus:ring-2 focus:ring-ring focus:outline-none"
      >
        Skip to main content
      </a>
      {/* next-themes injects a blocking script that sets .dark before first paint (no flash). */}
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
