# Design System Document: High-Stakes Noir

## 1. Overview & Creative North Star: "The Grandmaster’s Lounge"
The Creative North Star for this design system is **The Grandmaster’s Lounge**. We are moving away from the loud, flickering neon of "arcade-style" gambling and into the hushed, high-stakes atmosphere of a private members' club. 

This system breaks the "template" look by favoring **atmospheric depth** over structural rigidity. We utilize intentional asymmetry in the UI layout—placing the pot off-center or using overlapping card animations—to mimic a physical table experience. The interface should feel less like an "app" and more like a high-end editorial spread in a luxury lifestyle magazine.

## 2. Colors & Atmospheric Tones
The palette is built on a foundation of deep, ink-like charcoals and emeralds, punctuated by the metallic brilliance of gold.

### The "No-Line" Rule
To maintain a premium feel, **1px solid borders are prohibited for sectioning.** Boundaries must be defined solely through background color shifts or tonal transitions. Use `surface-container-low` for secondary sections and `surface-container-highest` for active modals.

### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers. 
- **Base Layer:** `surface` (#131313) or `surface-dim`.
- **The Table (Mid-Ground):** A gradient transition from `surface-container-lowest` to a custom deep emerald (implied by the `outline-variant` in context).
- **Interactive UI (Foreground):** Use `surface-container-high` for player pods and control bars.

### The "Glass & Gradient" Rule
Floating elements (like the Betting Slider or Player Profiles) must utilize **Glassmorphism**. 
- **Formula:** `surface-variant` at 60% opacity + `backdrop-filter: blur(12px)`.
- **Signature Textures:** Main CTAs (Raise/Chaal) must use a linear gradient from `secondary` (#b6c4ff) to `secondary-container` (#0050ee) to provide a "lit from within" glow.

## 3. Typography: The Editorial Contrast
We pair an authoritative, high-contrast serif with a utilitarian, modern sans-serif to create a "Signature & System" hierarchy.

*   **The Signature (Noto Serif):** Used for "The Pot," "Win Amounts," and "Big Blind" markers. This conveys heritage, wealth, and the gravity of the stakes.
    *   *Display-LG:* For the ultimate winner announcement.
    *   *Headline-MD:* For the central pot amount.
*   **The System (Manrope):** Used for player names, UI controls, and data. This ensures maximum legibility during fast-paced play.
    *   *Title-SM:* For action button labels.
    *   *Label-MD:* For player status indicators (Active, Folded).

## 4. Elevation & Depth
Depth is achieved through **Tonal Layering** rather than drop shadows.

*   **The Layering Principle:** Place a `surface-container-lowest` card on a `surface-container-low` section. This creates a "recessed" or "carved" look, typical of high-end automotive dashboards.
*   **Ambient Shadows:** For floating card stacks, use a shadow with a 32px blur at 6% opacity, using the `on-surface` color. It should feel like a soft glow, not a dark smudge.
*   **The "Ghost Border" Fallback:** If a divider is required for accessibility, use `outline-variant` (#3f4945) at **15% opacity**. Never use 100% opacity.
*   **Light as Depth:** Use subtle radial gradients (Surface-Bright) in the center of the table to mimic an overhead spotlight, naturally drawing the eye to the Pot.

## 5. Components

### Action Buttons (The Triggers)
*   **Fold (Tertiary):** Background: `tertiary_container`. Text: `on_tertiary`. A deep, cautionary red that feels "final."
*   **Raise/Chaal (Secondary):** Background: Gradient of `secondary` to `secondary_container`. Text: `on_secondary`. This is the hero action; it should feel electric and confident.
*   **Shape:** Use `rounded-md` (0.375rem) for a sharp, modern professional look. Avoid "Pill" shapes as they feel too casual/mobile-first.

### Player Avatars & Status
*   **Active:** A 2px "Ghost Border" of `primary` (Gold) around the avatar.
*   **Folded:** Desaturate the avatar and set opacity to 40%.
*   **Dealer:** A small, metallic `primary` (Gold) coin icon overlapping the avatar edge at 2 o'clock.

### The Betting Slider
*   **Track:** `surface-container-highest`.
*   **Handle:** A solid `primary` (Gold) circle with a `primary-fixed-dim` outer glow.
*   **Labels:** Use `label-md` in `on-surface-variant` for incremental marks.

### Cards & Lists
*   **Prohibition:** No divider lines between player lists or settings. 
*   **Separation:** Use `8px` of vertical white space or a shift from `surface-container-low` to `surface-container-lowest` to distinguish items.

## 6. Do's and Don'ts

### Do:
*   **Do** use `primary` (Gold) sparingly. It is a "reward" color for winning and high-value highlights.
*   **Do** leverage the `display-lg` serif for "Big Win" moments to make the player feel like royalty.
*   **Do** use `surface-bright` for hover states on glass containers to simulate light hitting the glass.

### Don't:
*   **Don't** use pure white (#FFFFFF). Always use `on-surface` (#e5e2e1) to prevent eye strain during long sessions and maintain the "moody" vibe.
*   **Don't** use standard "Material Design" shadows. They are too generic for this luxury aesthetic.
*   **Don't** use the `error` color for anything other than system-critical failures. "Fold" is an intentional play, not an error.