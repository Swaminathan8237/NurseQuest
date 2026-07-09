/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      /* ── Fonts ── */
      fontFamily: {
        headline: ['Outfit', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        display: ['Outfit', 'sans-serif'],
        label: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },

      /* ── Colors ── */
      colors: {
        primary: {
          DEFAULT: '#b76dff',
          light: '#ddb7ff',
          dark: '#670dae',
          container: 'rgba(183, 109, 255, 0.18)',
        },
        tertiary: {
          DEFAULT: '#00E5FF',
          light: '#c3f5ff',
        },
        success: '#39FF14',
        warning: '#fabc4e',
        danger: '#FF3131',
        'on-surface': {
          DEFAULT: 'var(--text-primary)',
          variant: 'var(--text-secondary)',
        },
        brand: {
          surface: 'var(--bg-surface)',
          elevated: 'var(--bg-elevated)',
        },
      },

      /* ── Shadows ── */
      boxShadow: {
        'clay-outer':
          '6px 6px 16px rgba(0,0,0,0.45), -4px -4px 12px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.06)',
        'clay-sunken':
          'inset 3px 3px 8px rgba(0,0,0,0.5), inset -2px -2px 6px rgba(255,255,255,0.03)',
        'clay-inner':
          'inset 2px 2px 6px rgba(0,0,0,0.35), inset -1px -1px 4px rgba(255,255,255,0.04)',
      },

      /* ── Animations ── */
      animation: {
        slideUp: 'slideUp 0.6s cubic-bezier(0.22,1,0.36,1) both',
        fadeInUp: 'fadeInUp 0.6s ease-out both',
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
      },

      /* ── Gradient shorthand ── */
      backgroundImage: {
        'gradient-primary': 'linear-gradient(135deg, #b76dff 0%, #00E5FF 100%)',
      },
    },
  },
  corePlugins: {
    preflight: false, // Keep our existing CSS reset in index.css
  },
  plugins: [
    /* ── Custom component classes ── */
    function ({ addComponents }) {
      addComponents({
        /* ═══ Clay Card ═══ */
        '.clay-card': {
          background: 'var(--gradient-card)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)',
          boxShadow:
            '6px 6px 16px rgba(0,0,0,0.45), -4px -4px 12px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.06)',
        },
        '.clay-card:hover': {
          borderColor: 'var(--border-light)',
          boxShadow:
            '8px 8px 24px rgba(0,0,0,0.55), -4px -4px 16px rgba(255,255,255,0.05), inset 0 1px 0 rgba(255,255,255,0.08), 0 0 20px rgba(183,109,255,0.06)',
          transform: 'translateY(-2px)',
        },

        /* ═══ Clay Buttons ═══ */
        '.clay-button': {
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          borderRadius: '12px',
          border: '1px solid var(--border)',
          background: 'var(--bg-surface)',
          color: 'var(--text-primary)',
          cursor: 'pointer',
          fontFamily: 'Inter, sans-serif',
          fontWeight: '600',
          transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)',
          boxShadow:
            '3px 3px 8px rgba(0,0,0,0.35), -2px -2px 6px rgba(255,255,255,0.03)',
        },
        '.clay-button:hover': {
          transform: 'translateY(-1px)',
          boxShadow:
            '4px 4px 12px rgba(0,0,0,0.45), -2px -2px 8px rgba(255,255,255,0.04)',
        },
        '.clay-button:active': {
          transform: 'translateY(0) scale(0.98)',
          boxShadow:
            'inset 2px 2px 4px rgba(0,0,0,0.3), inset -1px -1px 3px rgba(255,255,255,0.02)',
        },

        '.clay-button-primary': {
          background: 'linear-gradient(135deg, #b76dff 0%, #9b4dff 100%)',
          color: '#ffffff',
          border: '1px solid rgba(183,109,255,0.3)',
          boxShadow:
            '3px 3px 10px rgba(0,0,0,0.4), -2px -2px 6px rgba(255,255,255,0.03), 0 0 12px rgba(183,109,255,0.15)',
        },
        '.clay-button-primary:hover': {
          boxShadow:
            '4px 4px 14px rgba(0,0,0,0.5), -2px -2px 8px rgba(255,255,255,0.04), 0 0 20px rgba(183,109,255,0.25)',
        },

        '.clay-button-outline': {
          background: 'transparent',
          border: '1px solid var(--border-light)',
        },
        '.clay-button-outline:hover': {
          background: 'var(--bg-hover)',
          borderColor: 'rgba(183,109,255,0.3)',
        },
      });
    },

    /* ── Light theme overrides ── */
    function ({ addComponents }) {
      addComponents({
        'body.light-theme .clay-card': {
          background: 'rgba(255,255,255,0.85)',
          border: '1px solid rgba(0,0,0,0.08)',
          boxShadow:
            '4px 4px 12px rgba(0,0,0,0.06), -3px -3px 8px rgba(255,255,255,0.8), inset 0 1px 0 rgba(255,255,255,0.9)',
        },
        'body.light-theme .clay-card:hover': {
          boxShadow:
            '6px 6px 18px rgba(0,0,0,0.09), -3px -3px 10px rgba(255,255,255,0.9), inset 0 1px 0 rgba(255,255,255,1), 0 0 15px rgba(183,109,255,0.06)',
        },
        'body.light-theme .clay-button': {
          background: '#ffffff',
          border: '1px solid rgba(0,0,0,0.08)',
          boxShadow:
            '2px 2px 6px rgba(0,0,0,0.06), -1px -1px 4px rgba(255,255,255,0.8)',
        },
        'body.light-theme .clay-button:hover': {
          boxShadow:
            '3px 3px 10px rgba(0,0,0,0.08), -2px -2px 6px rgba(255,255,255,0.9)',
        },
        'body.light-theme .clay-button-primary': {
          boxShadow:
            '2px 2px 8px rgba(0,0,0,0.08), 0 0 10px rgba(183,109,255,0.12)',
        },
      });
    },
  ],
};
