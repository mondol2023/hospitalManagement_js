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
 * ── Direction: "chart & instrument" ─────────────────────────────────────────
 * Neutrals carry a cool green bias (surgical drape), the single accent is a
 * petrol teal, and the semantic ramp is *reserved*: in a hospital UI red means
 * critical and nothing else, so the accent is never red and success/warning/
 * danger never appear as decoration. Elevation is a 1px line; shadows are for
 * things that genuinely float above the page.
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
            borderRadius: {
                control: '0.375rem',
                card: '0.5rem',
            },
            fontFamily: {
                // Archivo for headings and anything that has to read as a label.
                display: ['"Archivo Variable"', 'Archivo', 'ui-sans-serif', 'system-ui', 'sans-serif'],
                // Plex Sans is drawn for dense technical interfaces — it holds up at 13px.
                sans: ['"IBM Plex Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
                // Every identifier and quantity: MRNs, invoice numbers, money, vitals.
                mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
            },
            fontSize: {
                '2xs': ['0.6875rem', { lineHeight: '1rem' }],
            },
            letterSpacing: {
                label: '0.08em',
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
            },
            animation: {
                shimmer: 'shimmer 1.6s infinite',
            },
        },
    },
    plugins: [],
};
