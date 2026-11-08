import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }) {
  return <div className={cn("animate-pulse rounded-control bg-accent", className)} aria-hidden="true" {...props} />
}

export { Skeleton }
