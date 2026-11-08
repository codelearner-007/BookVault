import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Three styles per screen at most: default (the one filled pill), secondary (tonal), ghost.
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-transparent text-base font-semibold tracking-tight transition-[background-color,color,border-color,box-shadow,transform] duration-150 ease-out active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-primary hover:bg-primary-hover",
        secondary: "border-secondary-border bg-secondary text-secondary-foreground shadow-secondary hover:bg-secondary-hover",
        outline: "border-secondary-border bg-secondary text-secondary-foreground shadow-secondary hover:bg-secondary-hover",
        ghost: "text-muted-foreground hover:bg-accent hover:text-foreground",
        destructive: "bg-destructive text-destructive-foreground hover:opacity-90",
        link: "h-auto rounded-none px-0 font-medium text-link underline-offset-4 hover:underline",
      },
      size: {
        default: "h-control px-4.5",
        sm: "h-control-sm px-3.5 text-sm",
        lg: "h-control px-6",
        icon: "size-control",
        "icon-sm": "size-control-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"
  return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
})
Button.displayName = "Button"

export { Button, buttonVariants }
