---
name: Shift Management System
colors:
  surface: "#f8f9fa"
  surface-dim: "#d9dadb"
  surface-bright: "#f8f9fa"
  surface-container-lowest: "#ffffff"
  surface-container-low: "#f3f4f5"
  surface-container: "#edeeef"
  surface-container-high: "#e7e8e9"
  surface-container-highest: "#e1e3e4"
  on-surface: "#191c1d"
  on-surface-variant: "#414754"
  inverse-surface: "#2e3132"
  inverse-on-surface: "#f0f1f2"
  outline: "#727785"
  outline-variant: "#c1c6d6"
  surface-tint: "#005bc0"
  primary: "#005bbf"
  on-primary: "#ffffff"
  primary-container: "#1a73e8"
  on-primary-container: "#ffffff"
  inverse-primary: "#adc7ff"
  secondary: "#5b5f64"
  on-secondary: "#ffffff"
  secondary-container: "#dde0e6"
  on-secondary-container: "#5f6368"
  tertiary: "#9e4300"
  on-tertiary: "#ffffff"
  tertiary-container: "#c55500"
  on-tertiary-container: "#0e0200"
  error: "#ba1a1a"
  on-error: "#ffffff"
  error-container: "#ffdad6"
  on-error-container: "#93000a"
  primary-fixed: "#d8e2ff"
  primary-fixed-dim: "#adc7ff"
  on-primary-fixed: "#001a41"
  on-primary-fixed-variant: "#004493"
  secondary-fixed: "#dfe3e8"
  secondary-fixed-dim: "#c3c7cc"
  on-secondary-fixed: "#181c20"
  on-secondary-fixed-variant: "#43474c"
  tertiary-fixed: "#ffdbcb"
  tertiary-fixed-dim: "#ffb691"
  on-tertiary-fixed: "#341100"
  on-tertiary-fixed-variant: "#783100"
  background: "#f8f9fa"
  on-background: "#191c1d"
  surface-variant: "#e1e3e4"
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: "600"
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: "600"
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: "500"
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: "400"
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: "400"
    lineHeight: 20px
  label-lg:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: "500"
    lineHeight: 20px
    letterSpacing: 0.1px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: "500"
    lineHeight: 16px
    letterSpacing: 0.5px
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: "500"
    lineHeight: 16px
    letterSpacing: 0.5px
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: "600"
    lineHeight: 32px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  gutter: 16px
  margin-desktop: 24px
  margin-mobile: 16px
  sidebar-width: 280px
---

## Brand & Style

This design system is built on the principles of **Modern Corporate** efficiency, blending the systematic rigor of Material Design 3 with the clean, functional minimalism of modern UI libraries. The brand personality is **Systematic, Trustworthy, and Airy**, designed specifically to reduce the cognitive load of managers handling complex workforce logistics.

The aesthetic prioritizes clarity and whitespace to ensure that dense scheduling data remains readable. It avoids unnecessary ornamentation, favoring a "content-first" approach where the UI recedes to highlight employee availability and shift timing. The emotional response should be one of professional calm and organized control.

## Colors

The palette is anchored by **Google Blue (#1a73e8)**, serving as the primary driver for actions and focus states. The neutral palette relies on a range of cool grays to define structural hierarchy without adding visual noise.

- **Primary:** Used for main actions, active states, and primary navigation indicators.
- **Surface & Background:** High-key whites and subtle light grays (#f8f9fa) create a tiered layout that mimics physical paper on a desk.
- **Semantic Palette:** Soft but authoritative tones are used for status indicators:
  - **Green (Success):** Confirmed shifts and "On Shift" status.
  - **Amber (Warning):** Pending requests and "Open" slots.
  - **Red (Error):** Overtime alerts, scheduling conflicts, or absences.

## Typography

This design system utilizes **Inter** for all roles to achieve a cohesive, modern, and highly legible interface. The scale is optimized for data-dense environments, utilizing a slightly tighter letter-spacing on larger headlines and generous tracking for labels to ensure readability at small sizes.

- **Headlines:** Reserved for page titles and high-level dashboard metrics.
- **Body:** Used for general content and description. `body-md` is the workhorse for most UI text.
- **Labels:** Critical for the shift management context. Used for employee names in lists, shift times, and status tags. The medium and small variants use all-caps or high-tracking to differentiate them from body text.

## Layout & Spacing

The design system employs a **12-column fluid grid** for the main content area, anchored by a fixed-width sidebar on the left. The rhythm is based on an **8px baseline**, ensuring all components and padding are multiples of 8 to create a harmonious vertical flow.

### Breakpoints

- **Desktop (1440px+):** 12 columns, 24px margins, 16px gutters. Sidebar is expanded.
- **Tablet (768px - 1439px):** 8 columns, 24px margins, 16px gutters. Sidebar may collapse to an icon rail.
- **Mobile (Under 768px):** 4 columns, 16px margins, 12px gutters. Sidebar moves to a bottom navigation bar or a hamburger drawer.

Spacing should be generous between sections (32px - 48px) to maintain the "airy" feel, but tighter within components like list items or table rows (8px - 12px) to support data density.

## Elevation & Depth

Visual hierarchy is primarily established through **Tonal Layers** and **Subtle Ambient Shadows**. Following Material Design 3 logic, depth is used sparingly to signify importance or interactivity.

1.  **Level 0 (Background):** The base canvas, typically the neutral background color.
2.  **Level 1 (Default Card):** Low-contrast outlines (1px solid #e0e0e0) with no shadow. Used for flat containers like shift lists.
3.  **Level 2 (Hover/Active):** A soft, diffused shadow (Blur: 8px, Y: 2px, Opacity: 8% Black). Used when a user interacts with a shift card.
4.  **Level 3 (Modals/Popovers):** Higher elevation with a medium shadow (Blur: 16px, Y: 4px, Opacity: 12% Black) to focus attention.

Avoid heavy shadows. Use subtle color fills (e.g., a light blue tint for active sidebar items) to indicate "current" state without needing physical depth.

## Shapes

The shape language is **Rounded**, favoring 8px to 16px radii to create a friendly and approachable interface.

- **Small Components:** Checkboxes and small inputs use 4px (rounded-sm) to maintain a crisp feel.
- **Standard Components:** Buttons, text fields, and standard cards use 8px (rounded-md).
- **Large Containers:** Shift detail panels, modals, and prominent dashboard widgets use 16px (rounded-lg).
- **Navigation:** Sidebar active states and chips utilize a **Pill-shaped** (full round) geometry to stand out as distinct interactive elements.

## Components

### Buttons

- **Primary:** Filled with Primary Blue, white text, 8px radius. High-priority actions like "Add Shift."
- **Secondary:** Outlined with 1px gray border, 8px radius. Secondary actions like "Export."
- **Ghost:** No border or fill, only text color. Used for table actions.

### Cards

- Cards should be flat with a 1px neutral border. In a calendar view, shift cards use a left-edge color strip (semantic) to indicate status.

### Inputs

- Following the `shadcn/ui` style: 1px border, 8px radius, with a subtle 2px primary glow on focus. Labels sit clearly above the field in `label-md` weight.

### Chips

- Used for shift tags (e.g., "Night Shift," "Overtime"). Pill-shaped with a light background tint matching the semantic color and darker text for accessibility.

### Sidebar

- The sidebar utilizes a "Rail" or "Drawer" pattern. Active navigation items are indicated by a pill-shaped background highlight (Primary Blue at 10% opacity) and a high-contrast icon.

### Calendar/Scheduler

- Time blocks should use `rounded-md` (8px). Use horizontal scrolling for 24-hour views on mobile. Grid lines should be faint (#f0f0f0) to keep the focus on the shift cards.
