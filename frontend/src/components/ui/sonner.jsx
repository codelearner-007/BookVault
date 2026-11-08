"use client"

import { CircleCheck, Info, LoaderCircle, OctagonX, TriangleAlert } from "lucide-react"
import { useTheme } from "next-themes"
import { Toaster as Sonner } from "sonner"

// One quiet card per toast; only the icon carries the verdict colour.
const Toaster = ({ ...props }) => {
  const { resolvedTheme = "light" } = useTheme()

  return (
    <Sonner
      theme={resolvedTheme}
      className="toaster group"
      icons={{
        success: <CircleCheck className="size-4 text-ok" />,
        info: <Info className="size-4 text-info" />,
        warning: <TriangleAlert className="size-4 text-warn" />,
        error: <OctagonX className="size-4 text-bad" />,
        loading: <LoaderCircle className="size-4 animate-spin" />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "flex w-full items-center gap-3 rounded-menu border border-popover-border bg-popover px-4 py-3 font-sans text-sm text-popover-foreground shadow-pop",
          title: "font-semibold",
          description: "text-muted-foreground",
          actionButton: "ms-auto rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground",
          cancelButton: "rounded-full bg-accent px-3 py-1 text-xs font-semibold text-muted-foreground",
          closeButton: "rounded-full border border-popover-border bg-popover text-muted-foreground",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
