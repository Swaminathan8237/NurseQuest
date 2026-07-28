# SkillQuest Design System
> Learn · Practice · Excel — A gamified interactive quiz platform for everyone.

## Brand Identity

### Logo
The SkillQuest logo features a bold "Q" monogram encircling an open book with a reaching figure crowned by a golden star. The design conveys aspiration, knowledge, and achievement.

### Tagline
"Learn · Practice · Excel" — separated by centered dots, flanked by horizontal rules.

---

## Color Palette

### Primary Colors
| Token | Hex | HSL | Usage |
|-------|-----|-----|-------|
| `--primary` | `#7C3AED` | `hsl(263, 83%, 58%)` | Primary buttons, links, active states, focus rings |
| `--primary-light` | `#A78BFA` | `hsl(255, 92%, 76%)` | Hover states, gradients, secondary UI accents |
| `--primary-dark` | `#4A1D96` | `hsl(263, 68%, 35%)` | Headlines, deep gradients, pressed states |
| `--primary-glow` | `rgba(124, 58, 237, 0.35)` | — | Box-shadow glow effects, focus halos |

### Accent Colors
| Token | Hex | Usage |
|-------|-----|-------|
| `--accent-gold` | `#F59E0B` | Stars, achievements, XP badges, reward highlights |
| `--accent-gold-light` | `#FDE68A` | Gold tint backgrounds, streak indicators |
| `--accent-indigo` | `#6366F1` | Info badges, secondary accents |
| `--accent-emerald` | `#10B981` | Success states, correct answers, progress fills |
| `--accent-rose` | `#F43F5E` | Error states, wrong answers, danger actions |

### Semantic Colors
| Token | Hex | Usage |
|-------|-----|-------|
| `--success` | `#10B981` | Correct answers, completion indicators, positive toast |
| `--danger` | `#EF4444` | Wrong answers, destructive actions, error messages |
| `--warning` | `#F59E0B` | Caution states, time running low, streak at risk |
| `--info` | `#6366F1` | Tips, informational badges, neutral highlights |

### Dark Theme (Default)
| Token | Hex | Usage |
|-------|-----|-------|
| `--bg-base` | `#0F0E1A` | Page background, deepest layer |
| `--bg-surface` | `#1A1830` | Card backgrounds, sidebar |
| `--bg-card` | `#1E1B3A` | Elevated cards, modals |
| `--bg-elevated` | `#2A2650` | Hover states, input backgrounds |
| `--bg-hover` | `#342F60` | Interactive element hover |
| `--text-primary` | `#E8E4F5` | Headings, body text |
| `--text-secondary` | `#A8A3C0` | Subheadings, captions, muted labels |
| `--text-muted` | `#6E6A8A` | Placeholders, disabled text |
| `--border` | `rgba(255, 255, 255, 0.05)` | Card borders, dividers |
| `--border-light` | `rgba(255, 255, 255, 0.1)` | Hover borders, focus outlines |

### Light Theme
| Token | Hex | Usage |
|-------|-----|-------|
| `--bg-base` | `#FAF8FF` | Page background |
| `--bg-surface` | `#FFFFFF` | Card backgrounds |
| `--bg-card` | `#FFFFFF` | Elevated cards |
| `--bg-elevated` | `#F3F0FF` | Hover states, secondary surfaces |
| `--bg-hover` | `#EDE9FE` | Interactive hover |
| `--text-primary` | `#1E1B4B` | Headings, body text (navy) |
| `--text-secondary` | `#4C4883` | Subheadings |
| `--text-muted` | `#7C78A8` | Placeholders |

---

## Typography

### Font Stack
| Role | Family | Weights | Usage |
|------|--------|---------|-------|
| Heading / Display | `Outfit` | 600, 700, 800 | H1–H6, hero text, brand name, modal titles |
| Body / Label | `Inter` | 400, 500, 600 | Paragraphs, labels, buttons, inputs, nav links |
| Monospace | `JetBrains Mono` | 400 | Code snippets, room codes, timers, XP counters |
| Brand Name | `Manrope` | 700, 800 | "SkillQuest" wordmark in navbar/footer |

### Type Scale
| Token | Size | Line Height | Usage |
|-------|------|-------------|-------|
| `--text-xs` | 0.75rem (12px) | 1.5 | Tiny labels, badge text, timestamps |
| `--text-sm` | 0.875rem (14px) | 1.5 | Captions, secondary info, nav links |
| `--text-base` | 1rem (16px) | 1.6 | Body text, input text, descriptions |
| `--text-lg` | 1.125rem (18px) | 1.5 | Subheadings, card titles |
| `--text-xl` | 1.25rem (20px) | 1.3 | Section headings |
| `--text-2xl` | 1.5rem (24px) | 1.2 | Page titles |
| `--text-3xl` | 1.875rem (30px) | 1.2 | Hero subheading |
| `--text-4xl` | 2.25rem (36px) | 1.1 | Hero heading |
| `--text-5xl` | 3rem (48px) | 1.0 | Landing page hero title |

---

## Spacing & Layout

### Spacing Scale (4px base)
`4 | 8 | 12 | 16 | 20 | 24 | 32 | 40 | 48 | 64 | 80 | 96`

### Border Radius
| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | 4px | Small badges, tiny elements |
| `--radius-md` | 8px | Inputs, small buttons |
| `--radius-lg` | 12px | Cards, modals, primary buttons |
| `--radius-xl` | 16px | Large cards, hero sections |
| `--radius-full` | 9999px | Avatars, pills, circular buttons |

### Container
- Max width: `1280px`
- Padding: `16px` mobile, `32px` tablet, `48px` desktop

---

## Shadows & Elevation

### Clay / Neumorphism Shadows (Signature Style)
The design uses a "clay" shadow system that creates a tactile, raised-surface effect:

| Level | CSS | Usage |
|-------|-----|-------|
| Outer | `6px 6px 16px rgba(0,0,0,0.45), -4px -4px 12px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.06)` | Cards, buttons (resting) |
| Sunken | `inset 3px 3px 8px rgba(0,0,0,0.5), inset -2px -2px 6px rgba(255,255,255,0.03)` | Progress bar tracks, input fields |
| Inner | `inset 2px 2px 6px rgba(0,0,0,0.35), inset -1px -1px 4px rgba(255,255,255,0.04)` | Recessed areas, secondary panels |
| Glow | `0 0 30px rgba(124, 58, 237, 0.35)` | Primary CTA focus, active states |

---

## Gradients

| Name | CSS | Usage |
|------|-----|-------|
| Primary | `linear-gradient(135deg, #7C3AED 0%, #4A1D96 100%)` | Primary buttons, hero CTAs |
| Hero | `linear-gradient(135deg, #7C3AED 0%, #A78BFA 50%, #F59E0B 100%)` | Hero text gradient, brand accent |
| Gold Warm | `linear-gradient(135deg, #F59E0B 0%, #F43F5E 100%)` | Achievement unlocked, streak fire |
| Card | `linear-gradient(145deg, rgba(30, 27, 58, 0.8), rgba(42, 38, 80, 0.4))` | Card backgrounds (dark mode) |
| XP Bar | `linear-gradient(90deg, #7C3AED, #10B981)` | XP progress bar fill |

---

## Components

### Buttons
- **Primary**: Purple gradient background, white text, `border-radius: 12px`, clay outer shadow, hover: `translateY(-1px)` + glow
- **Secondary**: Transparent background, `1px solid var(--border-light)`, text color primary, hover: surface hover background
- **Ghost**: No background, no border, text secondary, hover: surface hover background
- **Danger**: `#EF4444` background, white text
- **Sizes**: `sm` (32px height), `md` (40px), `lg` (48px)
- **Loading state**: Content becomes transparent, spinner overlay

### Cards
- Background: `var(--gradient-card)` with `backdrop-filter: blur(20px)`
- Border: `1px solid var(--border)`
- Border-radius: `16px`
- Clay outer shadow
- Hover: border lightens, shadow intensifies, `translateY(-2px)`

### Inputs
- Height: `40px`
- Background: `var(--bg-input)`
- Border: `1px solid var(--border-light)`
- Border-radius: `8px`
- Focus: `border-color: var(--primary)`, `box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.15)`
- Label above input, error message below in red

### Navigation Bar
- Fixed top, glassmorphism `backdrop-filter: blur(20px)`
- Rounded pill shape (`border-radius: 9999px`)
- Brand logo (SkillQuest image) + text at left
- Nav links in center (pill-shaped active indicator)
- Theme toggle + XP badge + avatar at right
- Hamburger menu on mobile → slide-in drawer from right

---

## Gamification Elements

### XP Badge (Navbar)
- Clay-inset pill with ⚡ icon and XP count
- Pulse animation on ⚡ icon
- Color: primary gradient text

### Level Progress Bar
- Track: sunken clay shadow, rounded full
- Fill: gradient from `--accent-gold` to `--primary`
- Label: "⭐ Level Name" + "XP / NextXP"

### Achievement Badges
- Circular 64px icon container
- Tiers: Bronze `#CD7F32`, Silver `#C0C0C0`, Gold `#FFD700`, Platinum `#E5E4E2`
- Locked: `opacity: 0.5`, `filter: grayscale(1)`, lock overlay
- Unlocked: full color, subtle glow pulse

### Leaderboard
- Top 3: medal icons 🥇🥈🥉 with enlarged cards
- Current user row: accent background highlight
- Rank change indicators: ↑ green, ↓ red

### Quiz Player
- One question per screen
- Progress bar at top
- Timer: circular countdown (yellow when < 10s, red when < 5s)
- Answer feedback: ✅ green flash + "+10 XP" / ❌ red flash + explanation
- Score card: big number, star rating, XP earned, badges unlocked

---

## Motion & Animation

### Transitions
| Token | Duration | Easing | Usage |
|-------|----------|--------|-------|
| Fast | 150ms | `cubic-bezier(0.4, 0, 0.2, 1)` | Button hover, toggle |
| Base | 250ms | `cubic-bezier(0.4, 0, 0.2, 1)` | Card hover, dropdown open |
| Slow | 400ms | `cubic-bezier(0.4, 0, 0.2, 1)` | Page transitions, modals |
| Spring | 500ms | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Bouncy celebrations, level-up |

### Key Animations
- **slideUp**: `translateY(40px) → translateY(0)` with `scale(0.96 → 1)`, 0.6s
- **fadeInUp**: `translateY(30px) → translateY(0)` with `opacity(0 → 1)`, 0.6s
- **pulse**: subtle scale breathing on XP badge
- **confetti**: celebration particles on perfect score / level-up

### Reduced Motion
All animations respect `prefers-reduced-motion: reduce` — replaced with instant state changes.

---

## Responsive Breakpoints

| Name | Min Width | Typical Device |
|------|-----------|----------------|
| `sm` | 640px | Large phones |
| `md` | 768px | Tablets |
| `lg` | 1024px | Laptops |
| `xl` | 1280px | Desktops |

### Mobile Adaptations
- Navbar: hamburger → slide-in drawer
- Sidebar: collapses to bottom tab bar
- Cards: single column stack
- Quiz: full-width question cards
- Touch targets: minimum 44×44px
