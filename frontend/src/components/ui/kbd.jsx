import { cn } from "@/lib/utils"

// A keyboard hint ("Ctrl K"). Decorative: the control it sits in carries the accessible name.
function Kbd({ className, ...props }) {
  return (
    <kbd
      aria-hidden="true"
      className={cn(
        "inline-flex h-kbd shrink-0 items-center rounded-kbd bg-kbd px-1 font-sans text-2xs font-medium text-muted-foreground shadow-[inset_0_0_0_1px_var(--border)]",
        className
      )}
      {...props}
    />
  )
}

export { Kbd }
