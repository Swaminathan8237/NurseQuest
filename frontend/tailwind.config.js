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
          DEFAULT: '#7C3AED',
          light: '#A78BFA',
          dark: '#4A1D96',
          container: 'rgba(124, 58, 237, 0.18)',
        },
        tertiary: {
          DEFAULT: '#F59E0B',
          light: '#FDE68A',
        },
        success: '#10B981',
        warning: '#F59E0B',
        danger: '#EF4444',
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
        'gradient-primary': 'linear-gradient(135deg, #7C3AED 0%, #4A1D96 100%)',
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
            '8px 8px 24px rgba(0,0,0,0.55), -4px -4px 16px rgba(255,255,255,0.05), inset 0 1px 0 rgba(255,255,255,0.08), 0 0 20px rgba(124,58,237,0.15)',
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
          background: 'linear-gradient(135deg, #7C3AED 0%, #4A1D96 100%)',
          color: '#ffffff',
          border: '1px solid rgba(124,58,237,0.3)',
          boxShadow:
            '3px 3px 10px rgba(0,0,0,0.4), -2px -2px 6px rgba(255,255,255,0.03), 0 0 12px rgba(124,58,237,0.2)',
        },
        '.clay-button-primary:hover': {
          boxShadow:
            '4px 4px 14px rgba(0,0,0,0.5), -2px -2px 8px rgba(255,255,255,0.04), 0 0 20px rgba(124,58,237,0.35)',
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
