import type { Config } from 'tailwindcss'

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: 'var(--bg)',
          subtle: 'var(--bg-subtle)',
          elevated: 'var(--bg-elevated)',
        },
        surface: {
          DEFAULT: 'var(--surface)',
          elevated: 'var(--surface-elevated)',
        },
        card: 'var(--card)',
        border: {
          DEFAULT: 'var(--border)',
          subtle: 'var(--border-subtle)',
          soft: 'var(--border-soft)',
        },
        text: {
          DEFAULT: 'var(--text-primary)',
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          tertiary: 'var(--text-tertiary)',
          dim: 'var(--text-secondary)',
          faint: 'var(--text-tertiary)',
        },
        status: {
          gap: 'var(--status-gap)',
          warning: 'var(--status-warning)',
          compliant: 'var(--status-compliant)',
          neutral: 'var(--status-neutral)',
        },
        entity: {
          system: 'var(--entity-system)',
          datatype: 'var(--entity-datatype)',
          vendor: 'var(--entity-vendor)',
          clause: 'var(--entity-clause)',
        },
        accent: {
          blue: 'var(--accent-blue)',
          purple: 'var(--accent-purple)',
          green: 'var(--accent-green)',
          amber: 'var(--accent-amber)',
          red: 'var(--accent-red)',
        },
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
    },
  },
  plugins: [],
} satisfies Config