import { Providers } from '@/components/common/Providers';
import { ThemeToggle } from '@/components/ui/theme-toggle';

// Every auth screen: one centred glass card on the canvas, the theme toggle in the corner.
export default function AuthLayout({ children }) {
  return (
    <Providers>
      <main id="main" className="grid min-h-dvh place-items-center px-4 pb-12 pt-16">
        {children}
      </main>
      <div className="fixed end-4 top-4">
        <ThemeToggle />
      </div>
    </Providers>
  );
}
