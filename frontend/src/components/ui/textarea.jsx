import * as React from "react"

import { cn } from "@/lib/utils"
import { fieldClass } from "./input"

const Textarea = React.forwardRef(({ className, ...props }, ref) => (
  <textarea className={cn(fieldClass, "flex min-h-20 px-3.5 py-2.5", className)} ref={ref} {...props} />
))
Textarea.displayName = "Textarea"

export { Textarea }
