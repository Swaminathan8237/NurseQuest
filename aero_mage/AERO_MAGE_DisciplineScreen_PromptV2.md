# AERO M.A.G.E. — Discipline Selection Screen
# Flutter Production Specification v2.0
# Agentic Execution Prompt — Zero Ambiguity Target

---

## ROLE

You are a Senior Flutter Engineer, UI/UX Designer, and Flutter Performance Specialist.

Produce **production-ready Flutter code** following Flutter best practices, Material 3 conventions where applicable, clean architecture, reusable widgets, smooth animations, and maintainable code.

This is NOT prototype-quality work.
Every line must be merge-ready into a professional codebase without refactoring.

---

## HARD CONSTRAINTS

### NEVER DO:
- Run `flutter run`, `flutter pub get`, `dart format`, or any shell command
- Modify `pubspec.yaml`
- Create any file not listed in the OUTPUT MANIFEST
- Add business logic beyond what is specified
- Deviate from the design system defined in this document
- Use deprecated Flutter APIs
- Import any package not listed in DECLARED DEPENDENCIES
- Leave any TODO, FIXME, placeholder comment, or pseudo-code
- Hardcode a raw number (magic number) without a named constant or inline label comment
- Use `dynamic` types
- Use `!` force-unwrap on nullable without a null guard
- Print to console (`print`, `debugPrint`)

### DECLARED DEPENDENCIES (already in pubspec.yaml — do not add others):
```
clay_containers: ^2.0.0
google_fonts: ^6.2.1
flutter_sdk: (standard — all flutter/material, flutter/services, dart:ui)
```

---

## PROJECT

**Application:** AERO M.A.G.E.
**Screen Name:** Discipline Selection Screen
**Screen Role:** First experience after authentication — the user's initial interaction with the platform.

This screen must communicate premium quality within 300 milliseconds of appearing.
Every element must feel intentional, tactile, and polished.

---

## DESIGN SYSTEM

### 1. Design Language: Claymorphism (Soft UI)

- All surfaces appear as soft, matte, molded clay with gentle convex curvature
- No sharp corners anywhere (minimum `borderRadius: 28` everywhere)
- No glassmorphism (no `BackdropFilter`, no frosted effects)
- No neumorphism (no dual light/dark shadow trick)
- No flat design (all interactive surfaces must have clay depth)
- Gradients are forbidden except for the subtle ambient lighting that `ClayContainer` applies internally

### 2. Global Color Palette

Define these as `static const` inside a `DisciplineColors` class:

```dart
class DisciplineColors {
  DisciplineColors._();

  static const Color background    = Color(0xFFE0E5EC);
  static const Color medical       = Color(0xFFFFD1DC);
  static const Color dental        = Color(0xFFD4F0F0);
  static const Color engineering   = Color(0xFFFFDFBA);
  static const Color nursing       = Color(0xFFE6E6FA);
  static const Color textPrimary   = Color(0xFF2F3542);
  static const Color textMuted     = Color(0xFF8395A7);
  static const Color iconColor     = Color(0x8A000000); // Colors.black54 equivalent
}
```

No color may appear in the codebase as a raw `Color(...)` literal outside of this class.
Reference always as `DisciplineColors.background`, etc.

### 3. Typography — Nunito (Google Fonts)

Use `GoogleFonts.nunito(...)` for **every** `TextStyle` in this file.
Do NOT use `Theme.of(context).textTheme`.
Do NOT use the default system font.

Define these exact text styles as static getters on a `DisciplineTextStyles` class:

```dart
class DisciplineTextStyles {
  DisciplineTextStyles._();

  static TextStyle get badge => GoogleFonts.nunito(
    fontSize: 11,
    fontWeight: FontWeight.w800,
    color: DisciplineColors.textMuted,
    letterSpacing: 2.5,
  );

  static TextStyle get greeting => GoogleFonts.nunito(
    fontSize: 16,
    fontWeight: FontWeight.w600,
    color: DisciplineColors.textMuted,
    letterSpacing: 0,
  );

  static TextStyle get headerTitle => GoogleFonts.nunito(
    fontSize: 34,
    fontWeight: FontWeight.w800,
    color: DisciplineColors.textPrimary,
    letterSpacing: 0.5,
    shadows: [
      Shadow(
        color: Color(0x1F2F3542),
        blurRadius: 8,
        offset: Offset(0, 3),
      ),
    ],
  );

  static TextStyle get headerSubtitle => GoogleFonts.nunito(
    fontSize: 15,
    fontWeight: FontWeight.w500,
    color: DisciplineColors.textMuted,
    letterSpacing: 0,
  );

  static TextStyle get cardTitle => GoogleFonts.nunito(
    fontSize: 20,
    fontWeight: FontWeight.w700,
    color: DisciplineColors.textPrimary,
    letterSpacing: 0.3,
  );

  static TextStyle get cardSubtitle => GoogleFonts.nunito(
    fontSize: 13,
    fontWeight: FontWeight.w500,
    color: DisciplineColors.textMuted,
    letterSpacing: 0,
  );
}
```

### 4. ClayContainer Configuration

**Resting state (convex — default appearance):**
```
curveType : CurveType.convex
depth     : 30
spread    : 6
borderRadius : 32
```

**Pressed state (concave — while finger is down):**
```
curveType : CurveType.concave
depth     : 15
spread    : 3
borderRadius : 32
```

**Animation between states:**
- Interpolate `depth` and `spread` linearly using a `TweenAnimationBuilder<double>`
- Drive `pressProgress` from `0.0` (resting) to `1.0` (fully pressed)
- Duration: `150ms`
- Curve: `Curves.easeInOut`
- Switch `curveType` from convex → concave when `pressProgress > 0.5`
- Depth formula:  `30.0 - (15.0 * pressProgress)`
- Spread formula: `6.0 - (3.0 * pressProgress)`

---

## SCREEN ARCHITECTURE

### Widget Tree (top-level):

```
DisciplineSelectionScreen (StatefulWidget)        ← PUBLIC
└── Scaffold(backgroundColor: DisciplineColors.background)
    └── Stack
        ├── CustomPaint(_BackgroundTexturePainter) ← PRIVATE, fills screen
        └── SafeArea
            └── SingleChildScrollView
                └── Padding(h:24, top:32, bottom:48)
                    └── Column(crossAxisAlignment.center)
                        ├── _AeroBadgeWidget           ← PRIVATE
                        ├── SizedBox(height: 16)
                        ├── _GreetingWidget (conditional) ← PRIVATE
                        ├── SizedBox(height: 8) (conditional)
                        ├── _HeaderWidget              ← PRIVATE
                        ├── SizedBox(height: 40)
                        └── _DisciplineGrid            ← PRIVATE
                            └── ClayDisciplineCard × 4 ← PUBLIC
```

### Required File (Single Output):

```
discipline_selection_screen.dart
```

### Internal Code Order in That File:

1. Imports
2. `DisciplineColors`
3. `DisciplineTextStyles`
4. `DisciplineModel`
5. `_BackgroundTexturePainter`
6. `_AeroBadgeWidget`
7. `_GreetingWidget`
8. `_HeaderWidget`
9. `_DisciplineGrid`
10. `ClayDisciplineCard` (with its private `_ClayCardContent` inside)
11. `DisciplineSelectionScreen` (main screen, last in file)

---

## DATA MODEL

```dart
class DisciplineModel {
  const DisciplineModel({
    required this.id,
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.color,
    required this.onTap,
  });

  final String id;
  final String title;
  final String subtitle;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;
}
```

### Discipline Data (static list, defined inside `DisciplineSelectionScreen._buildDisciplines()`):

| id | title | subtitle | icon | color |
|---|---|---|---|---|
| `medical` | Medical | Pathology · Pharmacology | `Icons.favorite_rounded` | `DisciplineColors.medical` |
| `dental` | Dental | Oral Health · Radiology | `Icons.medical_services_rounded` | `DisciplineColors.dental` |
| `engineering` | Engineering | Circuits · Thermodynamics | `Icons.architecture` | `DisciplineColors.engineering` |
| `nursing` | Nursing | Patient Care · Theory | `Icons.local_hospital_rounded` | `DisciplineColors.nursing` |

Build this list as a private method on the screen state:
```dart
List<DisciplineModel> _buildDisciplines() { ... }
```
Each `onTap` maps to its corresponding callback parameter.

---

## SCREEN PUBLIC API

```dart
class DisciplineSelectionScreen extends StatefulWidget {
  const DisciplineSelectionScreen({
    super.key,
    this.userName,
    required this.onMedicalTap,
    required this.onDentalTap,
    required this.onEngineeringTap,
    required this.onNursingTap,
  });

  /// Optional authenticated user's full name.
  /// If provided and non-empty, a personalized greeting is shown.
  final String? userName;

  final VoidCallback onMedicalTap;
  final VoidCallback onDentalTap;
  final VoidCallback onEngineeringTap;
  final VoidCallback onNursingTap;
}
```

---

## ENTRY ANIMATION — COMPLETE SPECIFICATION

Use a **single** `AnimationController` on the screen state:

```dart
late final AnimationController _entranceController;
```

Configuration:
```
vsync    : SingleTickerProviderStateMixin on the State class
duration : Duration(milliseconds: 900)
```

Call `_entranceController.forward()` in `initState`.
Call `_entranceController.dispose()` in `dispose`.

Define **named animations** as late fields, each a `CurvedAnimation` scoped to an `Interval`:

```dart
late final Animation<double> _backgroundFade;
late final Animation<double> _badgeAnim;
late final Animation<double> _greetingAnim;
late final Animation<double> _headerAnim;
late final List<Animation<double>> _cardAnims; // length 4
```

Initialize in `initState` **after** the controller, using these intervals:

| Animation field | Interval start | Interval end | Curve |
|---|---|---|---|
| `_backgroundFade` | 0.00 | 0.30 | `Curves.easeOut` |
| `_badgeAnim` | 0.10 | 0.42 | `Curves.easeOutCubic` |
| `_greetingAnim` | 0.18 | 0.50 | `Curves.easeOutCubic` |
| `_headerAnim` | 0.22 | 0.55 | `Curves.easeOutCubic` |
| `_cardAnims[0]` (Medical) | 0.32 | 0.68 | `Curves.easeOutCubic` |
| `_cardAnims[1]` (Dental) | 0.40 | 0.76 | `Curves.easeOutCubic` |
| `_cardAnims[2]` (Engineering) | 0.46 | 0.82 | `Curves.easeOutCubic` |
| `_cardAnims[3]` (Nursing) | 0.52 | 0.88 | `Curves.easeOutCubic` |

### How to apply each animation:

**Background fade:**
Wrap the `CustomPaint` inside a `FadeTransition(opacity: _backgroundFade, ...)`.

**Badge, Greeting, Header:**
Each widget receives its animation as a constructor parameter.
Apply as:
```dart
FadeTransition(
  opacity: animation,
  child: SlideTransition(
    position: Tween<Offset>(
      begin: const Offset(0.0, 0.10),
      end: Offset.zero,
    ).animate(animation),
    child: /* actual widget */,
  ),
)
```

**Cards:**
`ClayDisciplineCard` receives `Animation<double> entranceAnimation` in its constructor.
It applies the same `FadeTransition` + `SlideTransition` pattern internally.
Slide start offset for cards: `Offset(0.0, 0.12)`.

**Do NOT use `AnimatedBuilder` on the parent screen for anything
that can be driven through `FadeTransition` / `SlideTransition` instead.**
This avoids unnecessary rebuilds of the full widget tree.

---

## BACKGROUND TEXTURE — _BackgroundTexturePainter

A `CustomPainter` that overlays a barely-visible dot noise grid, making the surface feel matte.

```
Visibility    : near-invisible — dot color opacity is 0.038
Dot shape     : circle
Dot radius    : 0.8 logical pixels
Grid step     : 18 logical pixels
Offset pattern: every odd row is shifted right by (step × 0.5) for organic feel
Color         : Color(0xFF2F3542) at opacity 0.038
shouldRepaint : always returns false
```

**Implementation:**
Use two nested `for` loops over the canvas size using `size.width` and `size.height`.
Row parity: `final offsetX = (row % 2 == 0) ? 0.0 : step * 0.5;`
Use a single pre-created `Paint` object; never create it inside the loop.

No `dart:math` `Random` — this is deterministic and never changes.

---

## WIDGET SPECIFICATIONS

### _AeroBadgeWidget

A small pill-shaped `ClayContainer` displaying the app wordmark above the header.

Constructor:
```dart
const _AeroBadgeWidget({required this.animation});
final Animation<double> animation;
```

Content:
```
ClayContainer
  color        : DisciplineColors.background
  borderRadius : 22
  depth        : 20
  spread       : 4
  curveType    : CurveType.convex
  child:
    Padding(horizontal: 20, vertical: 11)
      Text("AERO M.A.G.E.", style: DisciplineTextStyles.badge)
```

Wrap in FadeTransition + SlideTransition using `animation`.
Center aligned (parent Column is `crossAxisAlignment.center`).

---

### _GreetingWidget

Conditionally rendered — the parent checks `userName != null && userName!.trim().isNotEmpty` **before** inserting this widget into the Column. Do not do the null check inside the widget.

Constructor:
```dart
const _GreetingWidget({
  required this.firstName,
  required this.animation,
});
final String firstName;
final Animation<double> animation;
```

Compute `firstName` in the parent:
```dart
final String firstName = userName!.trim().split(' ').first;
```

Content:
```
Text("Good morning, $firstName 👋", style: DisciplineTextStyles.greeting)
textAlign: TextAlign.center
```

Wrap in FadeTransition + SlideTransition using `animation`.

---

### _HeaderWidget

Constructor:
```dart
const _HeaderWidget({required this.animation});
final Animation<double> animation;
```

Content:
```
Column(crossAxisAlignment.center)
  Text("Select Your Discipline", style: DisciplineTextStyles.headerTitle)
  textAlign: TextAlign.center
  SizedBox(height: 10)
  Text(
    "Choose a category to begin your journey.",
    style: DisciplineTextStyles.headerSubtitle,
    textAlign: TextAlign.center,
  )
```

Wrap in FadeTransition + SlideTransition using `animation`.

---

### _DisciplineGrid

Constructor:
```dart
_DisciplineGrid({
  required this.disciplines,
  required this.cardAnimations,
});
final List<DisciplineModel> disciplines;
final List<Animation<double>> cardAnimations;
```

(Non-const because `List` prevents const — this is acceptable.)

**Responsive layout via `LayoutBuilder`:**

```
All widths → 2 columns (as specified — 2-column grid is the design intent for all sizes)

childAspectRatio:
  if (maxWidth >= 600) → 1.1   // tablets see slightly wider cards
  else                 → 1.0   // phone: square cards
```

**Grid implementation:**
```dart
GridView.builder(
  shrinkWrap: true,
  physics: const NeverScrollableScrollPhysics(),
  gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
    crossAxisCount: 2,
    crossAxisSpacing: 20,
    mainAxisSpacing: 20,
    childAspectRatio: childAspectRatio,
  ),
  itemCount: disciplines.length, // always 4
  itemBuilder: (context, index) => ClayDisciplineCard(
    model: disciplines[index],
    entranceAnimation: cardAnimations[index],
  ),
)
```

---

### ClayDisciplineCard — PUBLIC, REUSABLE

```dart
class ClayDisciplineCard extends StatefulWidget {
  const ClayDisciplineCard({
    super.key,
    required this.model,
    required this.entranceAnimation,
  });

  final DisciplineModel model;
  final Animation<double> entranceAnimation;
}
```

**State variable:**
```dart
bool _isPressed = false;
```

**Interaction — complete state machine:**

```
GestureDetector callbacks:
  onTapDown   → setState(_isPressed = true)
  onTapUp     → _handleTapUp()
  onTapCancel → setState(_isPressed = false)
```

`_handleTapUp` implementation (async):
```dart
Future<void> _handleTapUp(TapUpDetails _) async {
  await HapticFeedback.mediumImpact();
  await Future.delayed(const Duration(milliseconds: 200));
  if (!mounted) return;
  setState(() => _isPressed = false);
  await Future.delayed(const Duration(milliseconds: 80));
  if (!mounted) return;
  widget.model.onTap();
}
```

This sequence means:
1. Card sinks (concave) for 200ms minimum
2. Card bounces back to convex
3. Callback fires 80ms later (after spring-back begins)

**Press animation — TweenAnimationBuilder:**
```dart
TweenAnimationBuilder<double>(
  tween: Tween<double>(begin: 0.0, end: _isPressed ? 1.0 : 0.0),
  duration: const Duration(milliseconds: 150),
  curve: Curves.easeInOut,
  builder: (context, pressProgress, child) {
    final double depth  = 30.0 - (15.0 * pressProgress);
    final double spread = 6.0  - (3.0  * pressProgress);
    final CurveType curveType = pressProgress > 0.5
        ? CurveType.concave
        : CurveType.convex;

    return ClayContainer(
      color: widget.model.color,
      borderRadius: 32.0,
      depth: depth,
      spread: spread,
      curveType: curveType,
      child: child,
    );
  },
  child: _ClayCardContent(model: widget.model), // const, not rebuilt
)
```

**Entrance animation wrapping:**
```dart
FadeTransition(
  opacity: widget.entranceAnimation,
  child: SlideTransition(
    position: Tween<Offset>(
      begin: const Offset(0.0, 0.12),
      end: Offset.zero,
    ).animate(widget.entranceAnimation),
    child: Semantics(
      label: '${widget.model.title} discipline. ${widget.model.subtitle}. Double tap to select.',
      button: true,
      excludeSemantics: true,
      child: GestureDetector(
        onTapDown: (_) => setState(() => _isPressed = true),
        onTapUp: _handleTapUp,
        onTapCancel: () => setState(() => _isPressed = false),
        child: TweenAnimationBuilder<double>( /* ... as above */ ),
      ),
    ),
  ),
)
```

---

### _ClayCardContent (PRIVATE — const StatelessWidget)

This widget is passed as `child` to the `TweenAnimationBuilder` to prevent it
from rebuilding on every animation frame (key performance optimization).

```dart
class _ClayCardContent extends StatelessWidget {
  const _ClayCardContent({required this.model});
  final DisciplineModel model;
}
```

Content:
```
Center
  Column(mainAxisSize.min, crossAxisAlignment.center)
    ├── _ClayIconBubble(model: model)  ← see below
    ├── SizedBox(height: 16)
    ├── Text(model.title, style: DisciplineTextStyles.cardTitle, textAlign: center)
    ├── SizedBox(height: 6)
    └── Text(model.subtitle, style: DisciplineTextStyles.cardSubtitle, textAlign: center)
```

---

### _ClayIconBubble (PRIVATE — const StatelessWidget)

A nested `ClayContainer` circle inside each card.

```dart
class _ClayIconBubble extends StatelessWidget {
  const _ClayIconBubble({required this.model});
  final DisciplineModel model;
}
```

Icon bubble background color formula:
```dart
final Color bubbleColor = Color.lerp(
  model.color,
  DisciplineColors.textPrimary,
  0.08,
)!;
```

```
SizedBox(width: 80, height: 80)
  ClayContainer
    color        : bubbleColor
    borderRadius : 40      // fully circular
    depth        : 16
    spread       : 4
    curveType    : CurveType.convex
    child:
      Center
        Icon(model.icon, size: 34, color: DisciplineColors.iconColor)
```

---

## RESPONSIVENESS REQUIREMENTS

- All widths from 320px to 1024px must render correctly with no overflow
- Never hardcode a width in pixels for any card or container
- The grid always occupies full available width minus padding (24px each side)
- `SingleChildScrollView` prevents overflow on short screen heights
- `shrinkWrap: true` on the grid ensures it doesn't try to fill infinite height
- `LayoutBuilder` inside `_DisciplineGrid` provides the available width

Landscape phone behavior:
- Still 2 columns (consistent with design spec)
- `childAspectRatio` adjusts to `1.15` when
  `MediaQuery.of(context).orientation == Orientation.landscape && maxWidth < 768`
  to prevent card height overflow

---

## ACCESSIBILITY

- Every `ClayDisciplineCard` is wrapped in `Semantics` with `button: true` and a descriptive `label`
- `excludeSemantics: true` on the Semantics node so child text elements are not double-announced
- `GestureDetector` minimum tap area is guaranteed by the card being a full grid cell
- No element that conveys information relies solely on color

---

## PERFORMANCE REQUIREMENTS

| Rule | Mandatory |
|---|---|
| `const` constructors on every widget that supports it | Yes |
| `const` color and style definitions via static fields | Yes |
| `_ClayCardContent` passed as `child` to `TweenAnimationBuilder` to avoid per-frame rebuilds | Yes |
| `_BackgroundTexturePainter.shouldRepaint` returns `false` | Yes |
| Animations driven by `FadeTransition`/`SlideTransition` (not `AnimatedBuilder` on parent) | Yes |
| `AnimationController` disposed in `dispose()` | Yes |
| No `setState` inside `build()` | Yes |
| No function closures allocated in `build()` for stable callbacks | Yes |
| `GridView` inside `SingleChildScrollView` uses `NeverScrollableScrollPhysics` | Yes |

---

## CODE QUALITY

- **Null safety:** Full. No suppressed nullability warnings.
- **Naming:** Meaningful identifiers only. No `val`, `temp`, `x`, `widget2`, `c`.
- **No magic numbers:** Every numeric literal must either be a named constant or have an inline `// comment` explaining it.
- **No commented-out code blocks.**
- **Effective Dart conventions** throughout.
- **Private widgets** use the `_` prefix.
- **Public API** (`DisciplineSelectionScreen`, `ClayDisciplineCard`) is fully documented with `///` doc comments.
- `DisciplineColors` and `DisciplineTextStyles` use private constructors (`ClassName._()`) to prevent instantiation.

---

## IMPORTS (required at top of file — no others)

```dart
import 'package:clay_containers/clay_containers.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
```

If `lerpDouble` is required for any computation, use `dart:ui`:
```dart
import 'dart:ui' show lerpDouble;
```

---

## OUTPUT MANIFEST

**Exactly ONE file:**

```
discipline_selection_screen.dart
```

**This file MUST:**
- Compile without error or warning under Dart null-safety
- Contain zero TODOs
- Contain zero placeholder comments
- Contain zero `// ignore:` directives
- Export `DisciplineSelectionScreen` and `ClayDisciplineCard` as public symbols
- Keep all helpers, painters, and internal widgets private (`_` prefix)
- Be self-contained — no imports from other project files
- Follow the internal code order specified in SCREEN ARCHITECTURE → Internal Code Order

---

## QUALITY BAR

The rendered output must feel:

- **Soft** — no hard edges, no harsh shadows
- **Tactile** — cards visibly sink on press, spring back on release
- **Elegant** — Nunito typography with deliberate weight hierarchy
- **Animated** — staggered entrance where every element has a choreographed arrival time
- **Calm** — pastel palette, no visual noise beyond the subtle texture
- **Premium** — indistinguishable from a polished App Store app

This screen competes with the best Dribbble shots for Flutter UI.
It is the user's first impression of the platform.
It must earn trust through craft.
