# Nebula Core Design System Guidelines

## Brand & Style

The design system is centered on a **Glassmorphic Space** aesthetic, tailored for a tray-first desktop utility. The personality is "Quietly Powerful"—it remains unobtrusive in the background but feels high-tech and precise when summoned. 

The visual narrative uses deep space blacks to minimize light bleed in desktop environments, layered with frosted translucent panels that suggest depth without visual clutter. Neon blue accents serve as functional signals, cutting through the darkness to guide the eye toward critical security actions and OTP data. The overall emotional response should be one of security, speed, and futuristic convenience.

## Layout & Spacing

As a tray-first utility, the design system adheres to a **Fixed Width / Dynamic Height** model. The standard width is constrained to 380px to align with system tray expectations.

The layout uses a modular 4px grid system. Content is housed within card containers to provide logical separation between different service providers (Gmail, Outlook, etc.). Margin and padding are generous (24px) to ensure the UI feels "airy" despite its small footprint. Elements within cards utilize 16px (1rem) spacing to maintain a compact but accessible density.

## Elevation & Depth

Hierarchy is established through **Refractive Glassmorphism** rather than traditional drop shadows.

- **Level 0 (Base):** Solid #060A14.
- **Level 1 (Cards):** 82% opacity background with `backdrop-filter: blur(20px)`. These panels feature a 1px solid border at 15% opacity to define the edge against the dark background.
- **Level 2 (Popovers/Overlays):** 90% opacity with a subtle neon inner-glow (box-shadow: inset 0 0 10px rgba(96, 165, 250, 0.1)).

Interactivity is communicated through "glow" states—hovering over an interactive card or button increases the border opacity and adds a subtle blue ambient shadow.

## Components

### Window Controls
Frameless design. The title bar includes a `-` and `x` button in the top right. These buttons are 32x32px squares with 4px rounded corners. The close button (`x`) transitions to a red background on hover, while minimize (`-`) uses a subtle slate.

### Account Cards
Glassmorphic panels containing the account name, email, and action buttons. Buttons within cards are stacked horizontally at the bottom right.

### Action Buttons
- **Primary:** Solid blue gradient background with white text.
- **Secondary:** Ghost style with a 1px slate border and white text. 
- **Destructive:** Slate border with red-tinted text (#F87171) for "Remove" actions.

### Input Fields
Dark backgrounds (#0F172A) with a 1px border. Focus state triggers a primary neon blue border and a subtle outer glow. Labels are positioned above the field in `label-caps` style.

### OTP Feed
Cards that display a progress bar (timer) at the bottom. The OTP code is centered and uses the `code-otp` typography style for maximum prominence.

---

## Colors

The palette is strictly dark-mode, optimized for OLED and high-contrast desktop viewing. 

- **Primary:** Neon Blue (#60A5FA) is reserved for interactive states, primary buttons, and active indicators.
- **Surface:** The background is a void-black (#060A14), providing a canvas for the glass layers.
- **Glass Layers:** Containers utilize a semi-transparent dark fill with a high blur radius to create a sense of physical layering above the desktop wallpaper.
- **Borders:** Subtle slate-tinted borders define boundaries without creating high-contrast noise.

## Typography

This design system utilizes the native system stack for maximum legibility and seamless OS integration. 

Emphasis is placed on vertical rhythm and clear hierarchy. Large, bold headlines are used for view titles (e.g., Settings, Gmail OTP), while labels use uppercase styling with increased tracking for a technical, utility-first feel. OTP codes are treated as primary data objects, using increased size and weight to ensure they are readable at a glance.

## Shapes

The shape language is "Soft-Modern." All primary containers and buttons use an 8px (0.5rem) corner radius. This balances the technical/industrial nature of the space theme with an approachable, ergonomic feel. 

Input fields and small utility buttons (like the window controls) follow the same 8px rule, while pill-shaped elements (chips) are reserved only for status indicators.
