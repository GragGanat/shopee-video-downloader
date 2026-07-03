## Design Brainstorm: Shopee Video Downloader

### Three Approaches

| # | Theme Name | Very Brief Intro | Probability |
|---|-----------|-----------------|-------------|
| 1 | **Shopee Red Pulse** | Bold orange-red gradients inspired by Shopee's brand colors, with energetic motion and shopping-inspired visual cues. Feels like an extension of Shopee's own UI. | 0.08 |
| 2 | **Midnight Extractor** | Dark, sleek, and utilitarian — a hacker-tool aesthetic with deep navy backgrounds, neon green accents, and monospace typography. Feels powerful and technical. | 0.05 |
| 3 | **Clean Minimalist** | Ultra-clean white/light theme with subtle shadows, rounded cards, and Shopee orange as the sole accent color. Professional and trustworthy. | 0.07 |

---

### Selected Approach: Shopee Red Pulse

**Design Movement:** Bold utility with brand affinity — borrowing Shopee's energetic orange-red palette but elevating it into a premium tool interface.

**Core Principles:**
1. Brand recognition — users should immediately feel "this is for Shopee"
2. Speed perception — the UI should feel fast and responsive
3. Trust — clean validation, clear error states, no clutter
4. One-purpose focus — this is a single-tool site, no navigation needed

**Color Philosophy:**
- Primary: Shopee orange (#EE4D2D) — creates instant brand recognition
- Secondary: Deep navy (#0F172A) — dark background makes the orange pop
- Accent: Coral (#FF6B35) — for hover states and gradients
- Text: White on dark, soft gray for secondary text
- Success: Emerald green for download actions

**Layout Paradigm:**
- Single-column centered tool (the one thing this site does)
-+ Hero section with bold typography
- Input area as the focal point (large, prominent)
- Results appear inline below (no page navigation)
- No navbar needed — single-purpose tool

**Signature Elements:**
1. Orange-to-coral gradient button with subtle glow effect
2. Auto-detect badge that slides in when URL is pasted
3. Video result card with smooth slide-up animation

**Interaction Philosophy:**
- Instant feedback: URL detection happens as you type
- Button press animation (scale down slightly)
- Loading state with pulsing orange indicator
- Results slide in from bottom with staggered animation

**Animation:**
- Entrance: Content fades in with slight upward movement (200ms, ease-out)
- Auto-detect badge: Scale in from 0.9 with opacity fade (150ms)
- Result card: Slide up from bottom with opacity (250ms, staggered children)
- Button: Active state scale(0.97) in 100ms
- Loading: Pulse animation on spinner (1s loop)

**Typography System:**
- Headings: `Outfit` — geometric, modern, energetic
- Body: `Inter` — clean, readable
- URL/monospace elements: `JetBrains Mono` for pasted URLs

**Brand Essence:** "The fastest way to download any Shopee video, anywhere, free"

**Brand Voice:** Direct, helpful, confident. No fluff.
- Headline: "Download Shopee Videos in Seconds"
- CTA: "Paste a link, get your video"

**Wordmark & Logo:** A bold "SV" monogram in orange with a download arrow integrated into the V, on a transparent background.

**Signature Brand Color:** Shopee Orange — `#EE4D2D` (ownable, unmistakable)
