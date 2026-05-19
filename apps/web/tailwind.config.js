import tailwindcssAnimate from 'tailwindcss-animate';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'serif'],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        warm: '0 1px 2px rgb(45 35 28 / 0.05), 0 6px 20px -4px rgb(45 35 28 / 0.1)',
        'warm-lg': '0 4px 24px -6px rgb(45 35 28 / 0.14)',
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        status: {
          success: 'hsl(var(--status-success-bg))',
          'success-fg': 'hsl(var(--status-success-fg))',
          warn: 'hsl(var(--status-warn-bg))',
          'warn-fg': 'hsl(var(--status-warn-fg))',
          error: 'hsl(var(--status-error-bg))',
          'error-fg': 'hsl(var(--status-error-fg))',
          neutral: 'hsl(var(--status-neutral-bg))',
          'neutral-fg': 'hsl(var(--status-neutral-fg))',
          info: 'hsl(var(--status-info-bg))',
          'info-fg': 'hsl(var(--status-info-fg))',
        },
      },
    },
  },
  plugins: [tailwindcssAnimate],
};
