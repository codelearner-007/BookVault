/**
 * LoadingSkeleton Component
 *
 * Reusable skeleton loader for better perceived performance
 */

export default function LoadingSkeleton({ rows = 3, className = '' }) {
  return (
    <div className={`space-y-4 ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="border border-border rounded-lg p-4 animate-pulse"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-2">
              <div className="h-5 bg-muted rounded w-1/3"></div>
              <div className="h-4 bg-muted rounded w-1/2"></div>
              <div className="h-3 bg-muted rounded w-1/4"></div>
            </div>
            <div className="h-9 bg-muted rounded w-24"></div>
          </div>
        </div>
      ))}
    </div>
  );
}
