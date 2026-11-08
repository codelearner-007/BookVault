import * as React from "react"
import { cva } from "class-variance-authority"

import { cn } from "@/lib/utils"

const alertVariants = cva(
  "relative grid w-full gap-1 rounded-control px-4 py-3 text-sm [&>svg~*]:ps-7 [&>svg]:absolute [&>svg]:start-4 [&>svg]:top-3.5 [&>svg]:size-4",
  {
    variants: {
      variant: {
        default: "bg-neutral-soft text-foreground [&>svg]:text-muted-foreground",
        info: "bg-info-soft text-foreground [&>svg]:text-info",
        warn: "bg-warn-soft text-foreground [&>svg]:text-warn",
        destructive: "bg-bad-soft text-bad [&>svg]:text-bad",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const Alert = React.forwardRef(({ className, variant, ...props }, ref) => (
  <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
))
Alert.displayName = "Alert"

const AlertTitle = React.forwardRef(({ className, ...props }, ref) => (
  <h5 ref={ref} className={cn("font-semibold tracking-tight", className)} {...props} />
))
AlertTitle.displayName = "AlertTitle"

const AlertDescription = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("text-sm [&_p]:leading-relaxed", className)} {...props} />
))
AlertDescription.displayName = "AlertDescription"

export { Alert, AlertTitle, AlertDescription }
