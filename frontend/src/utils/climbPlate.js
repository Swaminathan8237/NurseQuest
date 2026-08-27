// ── The climb plate ─────────────────────────────────────────────────────────────────
//
// THE INVARIANT: the surface directly behind a climb frame must be LIGHT. Always.
//
// Not because of the white sky. SectionSideCanvas already knocks that out per pixel
// (BG_KNOCKOUT_MIN = 230), so the sky is genuinely transparent — you could put it on
// anything. The reason is the two things that knockout deliberately KEEPS:
//
//   1. The stair line art is black. On a dark backdrop it disappears into it and she
//      is left climbing nothing.
//   2. She is composited with `mix-blend-multiply`. Multiply against a dark colour
//      drives every channel toward zero, so she renders as a black silhouette.
//
// Widening the knockout to swallow the stairs as well is not an escape — that removes
// the staircase, which is the whole picture. So: light backdrop, always.
//
// What must NOT happen is `#fff` hardcoded at each call site, which is why both forms
// live here instead of being retyped per page. Pick by whether the surface is themed:

// Themed surfaces (StudentDashboard) -> climbPlateStyle().
//
// Drives the --climb-plate / --climb-plate-wash tokens (frontend/src/index.css, light
// at :89 and dark at :198). Light mode is #F6F3FF — off-white, reads as white. Dark
// mode is #948BB8, a deliberately MUTED mid-tone: still light enough that the black
// stairs hold roughly 5:1 against it, but dim enough to read as a lit alcove rather
// than a white sticker pasted onto a dark card. Setting it to pure white in dark mode
// is the exact artefact the token exists to prevent, so "just use white" is right about
// the direction and wrong about the value.

// Light-LOCKED surfaces (Units) -> CLIMB_PLATE_LIGHT.
//
// The Units page hardcodes its palette (bg-[#f2f2f2], text-slate-900) and therefore
// stays light even in dark mode. A tokenized plate there would go violet-grey against a
// light-grey page — worse than hardcoding, because the plate would be the only element
// that switched. So it is pinned light ON PURPOSE, and pinned HERE so it is one edit
// rather than three when that changes. The day Units grows a dark variant, its plates
// move to climbPlateStyle() and this export is deleted.

// Dissolves the plate into whatever it sits on. Anchored at 88%/104% — bottom-right,
// where the art is anchored — and held fully opaque out to 66% of the radius, so no
// part of her, head included, is ever faded. Only the left and top edges, which are
// empty sky in every frame, fall away.
export const CLIMB_PLATE_MASK =
  'radial-gradient(96% 132% at 88% 104%, #000 0%, #000 66%, rgba(0,0,0,0.45) 86%, rgba(0,0,0,0) 100%)';

// The wash, written once. Anchored below the box (122%) so the violet pools under her
// feet and fades out before it reaches the sky the caption sits on.
const WASH = (violet, cyan, veil) =>
  `radial-gradient(120% 128% at 50% 122%, ${violet}, ${cyan} 44%, ${veil} 78%)`;

// Themed plate. Spread onto the element that sits behind the frame. `feather` masks the
// left and top edges away; pass false for a plate that is already a bordered card in its
// own right (a mask would fight the border).
export function climbPlateStyle({ feather = true } = {}) {
  return {
    backgroundColor: 'var(--climb-plate)',
    backgroundImage: 'var(--climb-plate-wash)',
    ...(feather
      ? { maskImage: CLIMB_PLATE_MASK, WebkitMaskImage: CLIMB_PLATE_MASK }
      : null),
  };
}

// Light-locked plate — same values as the light-mode tokens above, so the nurse reads
// identically on the dashboard and on Units. (Units previously ended its veil at 0.92
// rather than 0.96 and stopped at 76% rather than 78%; both were hand-copied and both
// are invisible, but one number beats two that drift.)
export const CLIMB_PLATE_LIGHT = {
  backgroundColor: '#FFFFFF',
  backgroundImage: WASH(
    'rgba(124, 58, 237, 0.16)',
    'rgba(0, 229, 255, 0.09)',
    'rgba(255, 255, 255, 0.96)'
  ),
};
