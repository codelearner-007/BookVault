---
name: project-redesign-v2
description: State of the BookVault frontend redesign as of 2026-11-08: round-1 rejected, v2 three options awaiting owner pick
metadata:
  type: project
---

Round 1 design samples (`backend-ref/manager-io/design-samples/`, direction A "Posting Stamp") were rejected by the owner on 2026-11-08; kept as reference only, don't edit them.

Round 2 lives in `backend-ref/manager-io/design-samples/v2/`: options A Nightglass (dark-first glass, hue 255, recommended), B Daylight (light, mulberry 350, top bar), C Soft Tint (lagoon 195, workspace rail + sheet). Gallery `v2/index.html`, rationale `v2/options.md`, generators `v2/_src/build.mjs` + `gallery.mjs` (regenerate pages from one content source).

**Why:** owner wanted a premium modern multi-tenant SaaS look; the full screen set is built only after the owner picks an option.
**How to apply:** if asked to continue the redesign, check which option the owner chose (options.md / PRODUCT.md "Design direction"), then extend the generator in that option; afterwards impeccable finish review + DESIGN.md are still owed.

Related: [[feedback-design-samples]]
