---
name: google-whisk
description: Creative image remixing and multi-image fusion guide based on Google Whisk (Google Labs' Subject + Scene + Style AI remix framework, integrated into Google Flow). Use when crafting multi-image fusion prompts, controlling visual aesthetics, combining subject references with custom environment styles, or migrating Whisk workflows into Google Flow.
---

# Google Whisk AI Skill

Google Whisk is Google Labs' image remixing model framework (now integrated into Google Flow). It uses a 3-part component breakdown (**Subject**, **Scene**, **Style**) to create visual blends without complex prompt engineering.

## The 3-Component Whisk Formula

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│     SUBJECT     │ +  │      SCENE      │ +  │      STYLE      │
│ (Character/Obj) │    │  (Environment)  │    │ (Art Direction) │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

1. **Subject**: The core element (e.g., a mascot, product, character, vehicle, or item).
2. **Scene**: The setting, location, backdrop, and environment context.
3. **Style**: The artistic medium, lighting style, color palette, or visual texture (e.g., watercolor, cyberpunk neon, 3D claymation, studio photography).

## Prompt Conversion Templates

### 1. Product Showcase
- **Subject**: Minimalist matte black wireless headphones
- **Scene**: Floating in zero-gravity amidst soft pastel geometric shapes
- **Style**: Studio product photography, soft diffused rim light, 8k commercial render

### 2. Character & Mascot Integration
- **Subject**: Friendly owl mascot wearing a graduation cap and glasses
- **Scene**: Modern futuristic classroom with interactive holographic displays
- **Style**: Vibrant 3D Pixar-style claymation, warm volumetric lighting

## Transition to Google Flow
As Google Whisk functionality is integrated into **Google Flow** (`flow.google`), use the **Style Anchor** and **Subject Lock** features in Flow to retain 100% visual consistency across video sequences and multi-shot renders.
