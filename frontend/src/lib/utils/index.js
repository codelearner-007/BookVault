import { clsx } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// Teach tailwind-merge the design-system names from globals.css so overrides replace, not stack.
const SPACING = [
  "control", "control-sm", "row", "row-head", "nav-item", "menu-item", "seg", "pill", "kbd", "dot",
  "mono", "mono-sm", "topbar", "shell-gap", "sidebar", "sidebar-icons", "drawer", "menu", "dialog",
  "palette", "page", "page-y", "card", "search", "search-min", "content", "prose",
]

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      spacing: SPACING,
      borderRadius: ["check", "kbd", "menu-item", "control", "mono", "menu", "card", "dialog", "shell"],
    },
    classGroups: {
      "font-size": [{ text: ["2xs", "md", "title", "field"] }],
      shadow: [{ shadow: ["card", "pop", "dialog", "primary", "secondary", "field", "seg", "seg-active", "nav-active", "highlight"] }],
    },
  },
})

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}
