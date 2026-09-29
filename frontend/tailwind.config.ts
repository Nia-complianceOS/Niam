import type { Config } from 'tailwindcss'
import animate from 'tailwindcss-animate'

/**
 * The colour tokens are CSS variables holding plain hex/rgba values (see
 * src/styles/globals.css), so the light/dark switch is a variable swap.
 * A bare `var(--x)` cannot take an opacity modifier, though: Tailwind
 * silently generates NOTHING for `bg-status-gap/10`, `bg-bg/90` and the
 * like. Mixing the variable with `transparent` restores the modifiers
 * without touching the variables. Tailwind substitutes <alpha-value> with
 * the modifier (0.1 for /10) or with its opacity variable (which defaults
 * to 1) when there is no modifier.
 */
const token = (name: string) =>
  `color-mix(in srgb, var(--${name}) calc(<alpha-value> * 100%), transparent)`

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: token('bg'),
          subtle: token('bg-subtle'),
          elevated: token('bg-elevated'),
        },
        surface: {
          DEFAULT: token('surface'),
          elevated: token('surface-elevated'),
          // Aliases used across the app that were never defined.
          raised: token('surface-elevated'),
          sunken: token('bg-subtle'),
        },
        card: token('card'),
        border: {
          DEFAULT: token('border'),
          subtle: token('border-subtle'),
          soft: token('border-soft'),
          strong: token('border-strong'),
        },
        text: {
          DEFAULT: token('text-primary'),
          primary: token('text-primary'),
          secondary: token('text-secondary'),
          tertiary: token('text-tertiary'),
          dim: token('text-secondary'),
          faint: token('text-tertiary'),
          muted: token('text-tertiary'),
        },
        status: {
          gap: token('status-gap'),
          warning: token('status-warning'),
          compliant: token('status-compliant'),
          neutral: token('status-neutral'),
        },
        entity: {
          system: token('entity-system'),
          datatype: token('entity-datatype'),
          vendor: token('entity-vendor'),
          clause: token('entity-clause'),
        },
        accent: {
          blue: token('accent-blue'),
          purple: token('accent-purple'),
          green: token('accent-green'),
          amber: token('accent-amber'),
          red: token('accent-red'),
          // Ontology aliases (entity-* is the canonical name).
          system: token('entity-system'),
          datatype: token('entity-datatype'),
          vendor: token('entity-vendor'),
          clause: token('entity-clause'),
        },
        // Semantic aliases for the statutory severity tokens.
        danger: token('status-gap'),
        warning: token('status-warning'),
      },
      fontFamily: {
        serif: ['Newsreader', 'Georgia', 'serif'],
        display: ['Newsreader', 'Georgia', 'serif'],
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        body: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      fontSize: {
        'display-2xl': ['3.5rem', { lineHeight: '1.1', letterSpacing: '-0.025em' }],
        'display-xl': ['2.25rem', { lineHeight: '1.15', letterSpacing: '-0.02em' }],
        'title-lg': ['1.5rem', { lineHeight: '1.25', letterSpacing: '-0.015em' }],
        'title-md': ['1.125rem', { lineHeight: '1.35', letterSpacing: '-0.01em' }],
        'body-base': ['0.875rem', { lineHeight: '1.5' }],
        'body-dense': ['0.8125rem', { lineHeight: '1.45' }],
        'mono-code': ['0.75rem', { lineHeight: '1.4' }],
        'eyebrow': ['0.6875rem', { lineHeight: '1.2', letterSpacing: '0.08em' }],
      },
      borderRadius: {
        sm: '4px',
        DEFAULT: '6px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        card: '12px',
        'card-sm': '8px',
      },
      spacing: {
        '0.2': '1px',
        '4.5': '1.125rem',
        '13': '3.25rem',
        '18': '4.5rem',
      },
      boxShadow: {
        xs: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [animate],
} satisfies Config