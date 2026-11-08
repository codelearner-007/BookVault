import { cn } from '@/lib/utils';
import { BRAND } from '@/lib/copy/brand';

/*
  The BookVault logo, concept B "dial o" (backend-ref/manager-io/design-samples/logo/b-dial-o-*.svg):
  the second o of "Book" is a combination dial (ring, fine ticks, index, hub).
    Wordmark  letters in currentColor, the dial in the brand (ice) token, so it follows light and dark.
    Mark      the dial on its tile (logo tokens: the same in both themes, like the app icon).
  Size it with a height class (h-5, h-6); the width follows the artwork.
*/
const STROKE = { fill: 'none', strokeWidth: 11, strokeLinecap: 'butt', stroke: 'currentColor' };
const DIAL_TICKS =
  'M141.00,65.70L141.00,61.80M146.25,65.91L147.60,63.57M150.09,69.75L152.43,68.40M150.30,75.00L154.20,75.00M150.09,80.25L152.43,81.60M146.25,84.09L147.60,86.43M141.00,84.30L141.00,88.20M135.75,84.09L134.40,86.43M131.91,80.25L129.57,81.60M131.70,75.00L127.80,75.00M131.91,69.75L129.57,68.40M135.75,65.91L134.40,63.57';
const MARK_TICKS =
  'M32.00,25.70L32.00,22.40M37.25,25.91L38.30,24.09M41.09,29.75L42.91,28.70M41.30,35.00L44.60,35.00M41.09,40.25L42.91,41.30M37.25,44.09L38.30,45.91M32.00,44.30L32.00,47.60M26.75,44.09L25.70,45.91M22.91,40.25L21.09,41.30M22.70,35.00L19.40,35.00M22.91,29.75L21.09,28.70M26.75,25.91L25.70,24.09';

export function LogoWordmark({ className }) {
  return (
    <svg viewBox="-6 18 459 90" role="img" aria-label={BRAND.name} className={cn('h-5 w-auto shrink-0', className)}>
      <path d="M5.5,30V100M0,35.5H28A14,14 0 0 1 28,63.5H5.5M5.5,63.5H30A15.5,15.5 0 0 1 30,94.5H0" {...STROKE} />
      <circle cx="84" cy="75" r="19.5" {...STROKE} />
      <circle cx="141" cy="75" r="19.5" fill="none" strokeWidth="11" className="stroke-brand" />
      <path d={DIAL_TICKS} strokeWidth="1.3" className="stroke-brand" />
      <circle cx="141" cy="75" r="3.4" fill="currentColor" />
      <path d="M136.5,39H145.5L141,45.5Z" fill="currentColor" />
      <path d="M179.5,28V100" {...STROKE} />
      <path d="M201,50H216.5L185,81.5V66Z M184.5,82L192.25,74.25L218,100H202.5Z" fill="currentColor" />
      <path d="M222,30H236.5L252,78.2L267.5,30H282L259.5,100H244.5Z" fill="currentColor" />
      <circle cx="310" cy="75" r="19.5" {...STROKE} />
      <path d="M329.5,50V100" {...STROKE} />
      <path d="M348.5,50V75A19.5,19.5 0 0 0 387.5,75V50M387.5,50V100" {...STROKE} />
      <path d="M406.5,28V100" {...STROKE} />
      <path d="M431,36V100M419,55.5H447" {...STROKE} />
    </svg>
  );
}

export function LogoMark({ className }) {
  return (
    <svg viewBox="0 0 64 64" role="img" aria-label={BRAND.name} className={cn('size-8 shrink-0', className)}>
      <rect width="64" height="64" rx="14" className="fill-logo-tile" />
      <circle cx="32" cy="35" r="17" fill="none" strokeWidth="7.5" className="stroke-logo-dial" />
      <path d={MARK_TICKS} strokeWidth="1.8" className="stroke-logo-dial" />
      <circle cx="32" cy="35" r="3.6" className="fill-logo-hub" />
      <path d="M32,35V26.5" strokeWidth="2.88" strokeLinecap="round" className="stroke-logo-hub" />
      <path d="M27.4,5.5H36.6L32,11.5Z" className="fill-logo-hub" />
    </svg>
  );
}
