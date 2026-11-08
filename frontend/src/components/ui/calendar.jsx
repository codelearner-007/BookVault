"use client"

import * as React from "react"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { DayPicker } from "react-day-picker"

import { cn } from "@/lib/utils"

// react-day-picker v9, Nightglass. Cells follow the control height (40px, 44px below lg).
// The range is one pill: an ice tint on the cells, solid ice discs at the start and end.
const CLASS_NAMES = {
  root: "relative w-fit select-none",
  months: "relative flex flex-col gap-6 md:flex-row",
  month: "flex flex-col gap-3",
  month_caption: "flex h-(--cell-size) items-center justify-center px-(--cell-size)",
  caption_label: "text-base font-semibold tracking-tight text-foreground",
  nav: "absolute inset-x-0 top-0 z-10 flex h-(--cell-size) items-center justify-between",
  button_previous:
    "inline-flex size-(--cell-size) items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-40 rtl:[&>svg]:rotate-180",
  button_next:
    "inline-flex size-(--cell-size) items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-40 rtl:[&>svg]:rotate-180",
  month_grid: "border-collapse",
  weekdays: "flex",
  weekday:
    "flex h-8 w-(--cell-size) items-center justify-center text-2xs font-semibold uppercase tracking-label text-muted-foreground",
  week: "mt-0.5 flex",
  day: "group/day relative size-(--cell-size) p-0 text-center",
  range_start: "rounded-l-full bg-brand/12",
  range_middle: "bg-brand/12 first:rounded-l-full last:rounded-r-full",
  range_end: "rounded-r-full bg-brand/12",
  selected: "",
  today: "",
  outside: "",
  disabled: "",
  hidden: "invisible",
}

function Chevron({ orientation, className }) {
  const Icon = orientation === "left" ? ChevronLeftIcon : ChevronRightIcon
  return <Icon aria-hidden className={cn("size-4", className)} />
}

function Calendar({ className, classNames, showOutsideDays = true, components, ...props }) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("[--cell-size:var(--spacing-control)]", className)}
      classNames={{ ...CLASS_NAMES, ...classNames }}
      components={{ Chevron, DayButton: CalendarDayButton, ...components }}
      {...props}
    />
  )
}

function CalendarDayButton({ className, day, modifiers, ...props }) {
  const ref = React.useRef(null)
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus()
  }, [modifiers.focused])

  const isEndpoint = modifiers.range_start || modifiers.range_end
  const isSolid = isEndpoint || (modifiers.selected && !modifiers.range_middle)

  return (
    <button
      ref={ref}
      type="button"
      data-day={day.isoDate}
      className={cn(
        "relative inline-flex size-full items-center justify-center rounded-full text-base font-normal tabular-nums text-foreground transition-colors",
        "hover:bg-accent focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        "disabled:pointer-events-none disabled:opacity-35",
        modifiers.outside && "text-muted-foreground/60",
        modifiers.today && !isSolid && "font-semibold ring-1 ring-inset ring-muted-foreground/45",
        modifiers.range_middle && "hover:bg-brand/15",
        isSolid && "bg-brand font-semibold text-brand-foreground hover:bg-brand",
        className
      )}
      {...props}
    />
  )
}

export { Calendar, CalendarDayButton }
