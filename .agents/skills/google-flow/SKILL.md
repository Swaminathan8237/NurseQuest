---
name: google-flow
description: Comprehensive workflow guide and prompt engine for Google Flow — Google Labs' unified AI creative studio powered by Veo, Imagen 4, and Gemini. Use when creating AI video scenes, multi-modal asset pipelines, storyboards, character-consistent video sequences, or AI creative workflows.
---

# Google Flow AI Studio Skill

Google Flow (`flow.google`) is Google’s AI creative studio that unifies image generation (Imagen 4), video synthesis (Veo 3.1), and conversational coordination (Gemini).

## Core Capabilities & Features

1. **Unified AI Asset Pipeline**: Create, edit, and transition seamlessly between 2D concept art, 3D spatial renders, and cinematic video.
2. **Character & Style Consistency**: Lock Subject, Style, and Lighting anchors across multiple scene generations.
3. **Cinematic Video Generation (Veo Engine)**: Generate 1080p/4K AI video clips with precise camera control (pan, zoom, orbit, crane, tracking shot).
4. **Custom AI Workflow Automation**: Chain image-to-video, style transfer, and script-to-storyboard pipelines.

## Camera & Motion Prompt Architecture (Veo 3.1)

When authoring prompts for Google Flow video generation, use this structured formula:

```
[Subject & Action] + [Camera Motion & Lens] + [Lighting & Atmosphere] + [Render Style & Quality]
```

### Examples:
- **Cinematic Orbit**: `"A cyberpunk hacker wearing a glowing visor looking out over a neon rain-soaked metropolis, 35mm lens, smooth 360-degree orbit shot, cinematic anamorphic lens flare, photorealistic 8k"`
- **Drone Tracking**: `"Fast low-altitude FP-drone tracking shot following a vintage red sports car racing down a winding coastal highway at golden hour, motion blur, hyperrealistic cinematic video"`

## Workflow Integration Steps

1. **Concept & Storyboard**: Draft key scene descriptions and camera motion notes.
2. **Keyframe Generation (Imagen 4)**: Generate subject and scene anchor frames.
3. **Motion Synthesis (Veo)**: Convert keyframes into fluid video clips with targeted camera motion.
4. **Style Lock**: Apply consistent color grading and character anchor embeddings.
