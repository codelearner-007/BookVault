import * as React from "react"
import { cva } from "class-variance-authority"

import { cn } from "@/lib/utils"

// A status pill: one dot plus one word. Colour only for verdicts; `role` and `outline` carry no dot.
const badgeVariants = cva(
  "inline-flex h-pill shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-semibold before:size-dot before:rounded-full before:bg-current before:content-['']",
  {
    variants: {
      variant: {
        neutral: "bg-neutral-soft text-neutral",
        ok: "bg-ok-soft text-ok",
        warn: "bg-warn-soft text-warn",
        bad: "bg-bad-soft text-bad",
        info: "bg-info-soft text-info",
        draft: "bg-neutral-soft text-neutral before:bg-transparent before:shadow-[inset_0_0_0_1.5px_currentColor]",
        void: "text-muted-foreground line-through shadow-[inset_0_0_0_1px_var(--border)] before:hidden",
        role: "bg-accent text-muted-foreground before:hidden",
        // legacy names kept so existing call sites read as statuses
        default: "bg-info-soft text-info",
        secondary: "bg-neutral-soft text-neutral",
        destructive: "bg-bad-soft text-bad",
        outline: "text-muted-foreground shadow-[inset_0_0_0_1px_var(--border)] before:hidden",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  }
)

function Badge({ className, variant, ...props }) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
