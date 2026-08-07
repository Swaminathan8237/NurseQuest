/** @type {import('tailwindcss').Config} */
export default {
  // Dark mode driven by [data-theme="dark"] (ThemeContext also toggles .dark for compat)
  darkMode: ['selector', '[data-theme="dark"]'],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      /* ── Fonts (Playful: Fredoka display + Nunito body) ── */
      fontFamily: {
        headline: ['Fredoka', 'Nunito', 'sans-serif'],
        display: ['Fredoka', 'Nunito', 'sans-serif'],
        body: ['Nunito', 'Fredoka', 'sans-serif'],
        label: ['Nunito', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },

      /* ── Colors ──
         Full Material palette consolidated here (previously supplied at runtime by the
         Tailwind Play CDN inline config in index.html). Every token the app uses now
         compiles into the local bundle. Values resolve to CSS vars defined for both light
         (:root) and dark ([data-theme="dark"]) themes in index.css. */
      colors: {
        /* Brand primary — Material tokens folded in; -light/-dark/-container/-fixed used across app */
        primary: {
          DEFAULT: '#7C3AED',
          light: '#A78BFA',
          dark: '#5B21B6',
          container: '#b76dff',
          fixed: '#f0dbff',
          'fixed-dim': '#ddb7ff',
        },
        'on-primary': { DEFAULT: '#490080', container: '#400071', fixed: '#2c0051', 'fixed-variant': '#670dae' },
        'inverse-primary': '#8134c7',

        /* Secondary (Material) */
        secondary: { DEFAULT: '#ddb7ff', container: '#583876', fixed: '#f0dbff', 'fixed-dim': '#ddb7ff' },
        'on-secondary': { DEFAULT: '#40215e', container: '#cba6ed', fixed: '#2a0848', 'fixed-variant': '#583876' },

        /* Tertiary — TEAL is what dev renders (CDN wins); keep config-only `light` */
        tertiary: { DEFAULT: '#71d7cd', light: '#FFE58A', container: '#32a097', fixed: '#8ef4e9', 'fixed-dim': '#71d7cd' },
        'on-tertiary': { DEFAULT: '#003733', container: '#00302c', fixed: '#00201d', 'fixed-variant': '#00504a' },

        /* Error (Material) */
        error: { DEFAULT: '#ffb4ab', container: '#93000a' },
        'on-error': { DEFAULT: '#690005', container: '#ffdad6' },

        /* Surfaces / background (Material) */
        background: 'var(--bg-base)',
        'on-background': 'var(--text-primary)',
        surface: 'var(--bg-surface)',
        'surface-bright': 'var(--bg-elevated)',
        'surface-dim': 'var(--bg-base)',
        'surface-variant': 'var(--bg-elevated)',
        'surface-tint': '#ddb7ff',
        'surface-container-lowest': 'var(--bg-base)',
        'surface-container-low': 'var(--bg-card)',
        'surface-container': 'var(--bg-surface)',
        'surface-container-high': 'var(--bg-elevated)',
        'surface-container-highest': 'var(--bg-hover)',
        'on-surface': { DEFAULT: 'var(--text-primary)', variant: 'var(--text-secondary)' },
        'inverse-surface': 'var(--bg-surface)',
        'inverse-on-surface': 'var(--text-primary)',
        outline: 'var(--text-muted)',
        'outline-variant': 'var(--border)',
        'brand-surface': 'var(--bg-surface)',
        'brand-elevated': 'var(--bg-elevated)',

        /* Playful accent scale — config-only DEFAULT+shadow variants preserved */
        ink: 'var(--ink)',
        coral: { DEFAULT: '#FF6B6B', shadow: '#C1443F' },
        sky: { DEFAULT: '#4DABF7', shadow: '#2B7CC4' },
        gold: { DEFAULT: '#FFD43B', shadow: '#C79A00' },
        success: { DEFAULT: '#12B76A', shadow: '#0B8A50' },
        warning: '#FFB020',
        danger: '#FF5A5F',
      },

      /* ── Border radius (chunkier) ── */
      borderRadius: {
        DEFAULT: '12px',
        lg: '16px',
        xl: '20px',
        '2xl': '28px',
        full: '9999px',
      },

      /* ── Shadows (signature hard offset, no blur) ── */
      boxShadow: {
        'hard-sm': '2px 2px 0 var(--border-ink-color)',
        hard: '4px 4px 0 var(--border-ink-color)',
        'hard-lg': '6px 6px 0 var(--border-ink-color)',
        'hard-xl': '8px 8px 0 var(--border-ink-color)',
        'clay-outer': 'var(--shadow-hard)',
        'clay-sunken': 'var(--shadow-hard-sm)',
        'clay-inner': 'var(--shadow-hard-sm)',
      },

      /* ── Animations ── */
      animation: {
        slideUp: 'slideUp 0.6s cubic-bezier(0.22,1,0.36,1) both',
        fadeInUp: 'fadeInUp 0.6s ease-out both',
        elasticPop: 'elasticPop 0.6s cubic-bezier(0.68,-0.55,0.27,1.55) both',
        glowPulse: 'glowPulse 2.5s ease-in-out infinite',
        glowPulseAmber: 'glowPulseAmber 2s ease-in-out infinite',
        xpFloat: 'xpFloat 1.4s cubic-bezier(0.19,1,0.22,1) forwards',
        levelUpBurst: 'levelUpBurst 0.8s cubic-bezier(0.68,-0.55,0.27,1.55) both',
        subtleDrift: 'subtleDrift 3s ease-in-out infinite',
        successFlash: 'successFlash 0.6s ease-out',
        errorShake: 'errorShake 0.4s ease-out',
        borderGlow: 'borderGlow 2s ease-in-out infinite',
        confetti: 'confettiPiece 1.5s cubic-bezier(0,0,0.2,1) forwards',
      },
      keyframes: {
        slideUp: {
          from: { opacity: '0', transform: 'translateY(40px) scale(0.96)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        fadeInUp: {
          from: { opacity: '0', transform: 'translateY(30px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        elasticPop: {
          '0%': { transform: 'scale(0)', opacity: '0' },
          '40%': { transform: 'scale(1.15)', opacity: '1' },
          '65%': { transform: 'scale(0.95)' },
          '80%': { transform: 'scale(1.05)' },
          '100%': { transform: 'scale(1)' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 8px rgba(124,58,237,0.3), 0 0 20px rgba(124,58,237,0.15)' },
          '50%': { boxShadow: '0 0 16px rgba(124,58,237,0.5), 0 0 40px rgba(124,58,237,0.25)' },
        },
        glowPulseAmber: {
          '0%, 100%': { boxShadow: '0 0 8px rgba(245,158,11,0.3)', textShadow: '0 0 8px rgba(245,158,11,0.4)' },
          '50%': { boxShadow: '0 0 20px rgba(245,158,11,0.5)', textShadow: '0 0 16px rgba(245,158,11,0.6)' },
        },
        xpFloat: {
          '0%': { opacity: '1', transform: 'translateY(0) scale(0.5)' },
          '20%': { opacity: '1', transform: 'translateY(-10px) scale(1.1)' },
          '100%': { opacity: '0', transform: 'translateY(-60px) scale(0.9)' },
        },
        subtleDrift: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
      },

      /* ── Gradient shorthand ── */
      backgroundImage: {
        'gradient-primary': 'linear-gradient(135deg, #7C3AED 0%, #5B21B6 100%)',
        'gradient-hero': 'linear-gradient(120deg, #7C3AED 0%, #FF6B6B 55%, #FFD43B 100%)',
      },
    },
  },
  corePlugins: {
    // Preflight ON — restores the base reset the app depends on. The UI was developed
    // against the Tailwind Play CDN (since removed from index.html), whose preflight
    // normalizes bare form controls — notably `button { background-color: transparent }`.
    // Many buttons set only `color` and lean on that transparency (the auth Sign In / Sign
    // Up toggle, "Forgot Password", admin student cards, the landing logo/nav buttons); with
    // preflight off they painted the browser-default white/grey box. `@tailwind base` is
    // emitted before all custom CSS in index.css, so our own reset and component styles
    // still override preflight where they intentionally differ.
    preflight: true,
  },
  plugins: [
    /* ── Playful component classes (clay-* names kept for back-compat) ── */
    function ({ addComponents }) {
      addComponents({
        /* ═══ Card ═══ */
        '.clay-card': {
          background: 'var(--bg-card)',
          border: 'var(--border-ink)',
          borderRadius: '16px',
          transition: 'transform 0.2s cubic-bezier(0.4,0,0.2,1), box-shadow 0.2s cubic-bezier(0.4,0,0.2,1)',
          boxShadow: 'var(--shadow-hard)',
        },
        '.clay-card:hover': {
          boxShadow: 'var(--shadow-hard-lg)',
          transform: 'translate(-1px, -1px)',
        },

        /* ═══ Buttons ═══ */
        '.clay-button': {
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          borderRadius: '12px',
          border: 'var(--border-ink)',
          background: 'var(--bg-surface)',
          color: 'var(--text-primary)',
          cursor: 'pointer',
          fontFamily: "'Fredoka', 'Nunito', sans-serif",
          fontWeight: '700',
          transition: 'transform 0.15s cubic-bezier(0.4,0,0.2,1), box-shadow 0.15s cubic-bezier(0.4,0,0.2,1)',
          boxShadow: 'var(--shadow-hard-sm)',
        },
        '.clay-button:hover': {
          transform: 'translate(-1px, -1px)',
          boxShadow: 'var(--shadow-hard)',
        },
        '.clay-button:active': {
          transform: 'translate(2px, 2px)',
          boxShadow: '0 0 0 var(--border-ink-color)',
        },

        '.clay-button-primary': {
          background: 'var(--primary)',
          color: '#ffffff',
        },

        '.clay-button-outline': {
          background: 'transparent',
        },
        '.clay-button-outline:hover': {
          background: 'var(--bg-hover)',
        },
      });
    },
  ],
};
