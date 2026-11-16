import type { Config } from 'tailwindcss';

/**
 * Design tokens live here, once. Components consume `bg-surface`,
 * `text-muted`, `border-line` — never a raw hex or an arbitrary `p-[13px]`.
 * That is the DRY rule from ARCHITECTURE.md §9 made mechanical: retheming the
 * app is an edit to this file, not a find-and-replace across 200 components.
 *
 * Colors are expressed as CSS variables (see src/index.css) so light and dark
 * are the same class names with different variable values — no `dark:` variant
 * on every single element.
 *
 * ── Direction: "Wayfinding" (FRONTEND_PLAN.md §3) ───────────────────────────
 * A sage-tinted ground, a eucalyptus primary and one apricot highlight (`warm`,
 * a fill — never text). The semantic ramp is *reserved*: in a hospital UI red
 * means critical and nothing else, so the accent is never red and success/
 * warning/danger never appear as decoration. Elevation is a 1px line; shadows
 * are for things that genuinely float above the page.
 */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'rgb(var(--color-canvas) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        'surface-raised': 'rgb(var(--color-surface-raised) / <alpha-value>)',
        line: 'rgb(var(--color-line) / <alpha-value>)',
        content: 'rgb(var(--color-content) / <alpha-value>)',
        muted: 'rgb(var(--color-muted) / <alpha-value>)',
        brand: {
          DEFAULT: 'rgb(var(--color-brand) / <alpha-value>)',
          fg: 'rgb(var(--color-brand-fg) / <alpha-value>)',
          soft: 'rgb(var(--color-brand-soft) / <alpha-value>)',
        },
        warm: {
          DEFAULT: 'rgb(var(--color-warm) / <alpha-value>)',
          soft: 'rgb(var(--color-warm-soft) / <alpha-value>)',
          fg: 'rgb(var(--color-warm-fg) / <alpha-value>)',
        },
        success: {
          DEFAULT: 'rgb(var(--color-success) / <alpha-value>)',
          soft: 'rgb(var(--color-success-soft) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'rgb(var(--color-warning) / <alpha-value>)',
          soft: 'rgb(var(--color-warning-soft) / <alpha-value>)',
        },
        danger: {
          DEFAULT: 'rgb(var(--color-danger) / <alpha-value>)',
          soft: 'rgb(var(--color-danger-soft) / <alpha-value>)',
        },
        info: {
          DEFAULT: 'rgb(var(--color-info) / <alpha-value>)',
          soft: 'rgb(var(--color-info-soft) / <alpha-value>)',
        },
      },
      // Radii follow hierarchy: panels 14px, controls 8px, status pills `rounded-full`.
      borderRadius: {
        control: '0.5rem',
        card: '0.875rem',
      },
      fontFamily: {
        // Page titles and public headlines. Variable with an optical-size axis
        // (opsz 12–96), so it tightens up when large and opens up when small.
        display: ['"Bricolage Grotesque Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        // UI and body. Drawn for low-vision readers; `1 l I` and `0 O` are distinct.
        sans: ['"Atkinson Hyperlegible Next Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        // Clinical identifiers only — MRNs, doses, invoice numbers, bed codes —
        // where misreading one character has real consequences.
        mono: [
          '"Atkinson Hyperlegible Mono Variable"',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'monospace',
        ],
      },
      // 1.25 scale: 13 · 15 (app body) · 17 (public body) · 21 · 26 · 33 · 41 · 52.
      // Body sizes run at 1.5 line height, display sizes at 1.15.
      fontSize: {
        '2xs': ['0.8125rem', { lineHeight: '1.25rem' }],
        xs: ['0.8125rem', { lineHeight: '1.25rem' }],
        sm: ['0.9375rem', { lineHeight: '1.4rem' }],
        base: ['1.0625rem', { lineHeight: '1.6rem' }],
        lg: ['1.3125rem', { lineHeight: '1.75rem' }],
        xl: ['1.625rem', { lineHeight: '1.15' }],
        '2xl': ['2.0625rem', { lineHeight: '1.15' }],
        '3xl': ['2.5625rem', { lineHeight: '1.15' }],
        '4xl': ['3.25rem', { lineHeight: '1.1' }],
      },
      spacing: {
        // Row height tuned for a gloved finger on a ward tablet.
        row: '2.75rem',
        sidebar: '15rem',
      },
      boxShadow: {
        // Reserved for genuinely floating surfaces. Cards use a border.
        pop: '0 16px 48px -16px rgb(4 20 18 / 0.35)',
      },
      keyframes: {
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        // The public departments strip: the track holds two copies of the list,
        // so moving half its width is a seamless loop.
        marquee: {
          to: { transform: 'translateX(-50%)' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.6s infinite',
        marquee: 'marquee 70s linear infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
