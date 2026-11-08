import * as React from "react"

import { cn } from "@/lib/utils"

export const fieldClass =
  "w-full rounded-control border border-input bg-field text-field text-foreground shadow-field transition-[border-color,box-shadow] duration-150 ease-out placeholder:text-placeholder hover:border-input-hover focus-visible:border-ring focus-visible:shadow-[0_0_0_2px_var(--ring-soft)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45 aria-[invalid=true]:border-bad"

const Input = React.forwardRef(({ className, type, ...props }, ref) => (
  <input
    type={type}
    className={cn(
      fieldClass,
      "flex h-control px-3.5 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
      className
    )}
    ref={ref}
    {...props}
  />
))
Input.displayName = "Input"

export { Input }
