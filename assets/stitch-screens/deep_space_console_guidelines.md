# Deep Space Console Design System Guidelines

## Brand & Style

This design system is built for the high-performance developer, where speed, precision, and information density are paramount. The aesthetic is a hybrid of **Minimalism** and **Glassmorphism**, specifically optimized for a dark, focused work environment.

The brand personality is technical, authoritative, and sophisticated. It seeks to evoke a sense of "state-of-the-art" capability, where the UI disappears to prioritize the user's code and terminal output. Visual interest is generated not through decorative elements, but through the interplay of deep charcoal surfaces, vibrant neon accents, and subtle backdrop blurs that provide a sense of layered depth without sacrificing focus.

Key characteristics include:
- **High-Density Layouts:** Maximizing screen real estate for data.
- **Visual Precision:** Sharp borders and monospaced alignment.
- **Glassmorphic Overlays:** Functional use of translucency to maintain spatial context.

## Layout & Spacing

The layout is a **Fluid Grid** system that prioritizes side-by-side comparisons and multi-pane workflows.

- **The Pane Model:** Content is divided into "blocks" or "panes." Panes are separated by high-contrast `1px` borders rather than wide gutters.
- **Density:** We use a tight 4px-based spacing scale. Components are packed closely to allow for maximum data visibility.
- **Safe Areas:** A constant `12px` margin is maintained at the outermost edges of the main application window.
- **Responsive Reflow:** On smaller screens (Tablet), the layout transitions from horizontal panes to a vertical stack. On Mobile, specific sidebars are hidden behind a drawer metaphor.

## Elevation & Depth

Depth is communicated through **Tonal Layering** and **Glassmorphism** rather than traditional shadows.

1.  **Base (Level 0):** The deepest layer, `#000000` or `#090909`. Used for the main terminal background.
2.  **Surface (Level 1):** `#1A1A1A`. Used for sidebars and header bars.
3.  **Overlay (Level 2):** Semi-transparent surfaces with a `20px` backdrop blur. Used for command palettes, dropdowns, and floating tooltips.
4.  **Borders:** Instead of shadows, use `1px` solid borders. For Level 1 surfaces, use `rgba(255, 255, 255, 0.08)`. For active states, use the primary accent color.

Avoid large, diffused shadows. If a shadow is required for a floating menu, use a very tight, high-opacity black shadow to simply separate the element from the background.

## Components

### Buttons
Buttons are low-profile. The default state is a subtle grey outline or a ghost background. The "Primary" state uses a solid gradient of the secondary/tertiary colors with white text.

### Chips / Badges
Used for status (e.g., Git branch, exit codes). These should be compact, using `body-sm` typography and a background tint that matches the semantic meaning (e.g., green tint for success).

### Input Fields
Inputs are defined by a `1px` bottom border in their default state, becoming a full box outline with a subtle glow when focused. The background should be slightly darker than the surrounding surface.

### Command Palette (Glass Component)
The most distinct component. It should feature a `40%` opaque background with a heavy backdrop blur (`blur-xl`), a thin white border (`0.1` opacity), and no external shadows.

### Lists
Lists use a full-width hover state with a `rgba(255, 255, 255, 0.04)` background. Active items are marked by a `2px` thick primary color "pill" or line on the left edge.
