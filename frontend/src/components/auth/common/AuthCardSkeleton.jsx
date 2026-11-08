import { Skeleton } from '@/components/ui/skeleton';

// Mirrors AuthCard: wordmark, title, lede, `fields` labelled inputs, the primary button.
export function AuthCardSkeleton({ fields = 1 }) {
  return (
    <div
      className="glass w-full max-w-md rounded-card border border-card-border p-10 shadow-card max-md:p-6"
      aria-busy="true"
    >
      <Skeleton className="mx-auto mb-6 h-6 w-28" />
      <Skeleton className="mx-auto h-7 w-40" />
      <Skeleton className="mx-auto mb-8 mt-3 h-4 w-60" />
      <div className="grid gap-5">
        {Array.from({ length: fields }, (_, index) => (
          <div key={index} className="grid gap-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-control rounded-control" />
          </div>
        ))}
        <Skeleton className="mt-2 h-control rounded-full" />
      </div>
    </div>
  );
}
