/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist Variable', 'Geist', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['Geist Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        'nuqe-purple':      'var(--nuqe-purple)',
        'nuqe-purple-hover':'var(--nuqe-purple-hover)',
        'nuqe-purple-light':'var(--nuqe-purple-light)',
        'nuqe-dark':        'var(--nuqe-dark)',
        'nuqe-bg':          'var(--nuqe-bg)',
        'nuqe-surface':     'var(--nuqe-surface)',
        'nuqe-surface-hi':  'var(--nuqe-surface-hi)',
        'nuqe-text':        'var(--nuqe-text)',
        'nuqe-muted':       'var(--nuqe-muted)',
        'nuqe-subtle':      'var(--nuqe-subtle)',
        'nuqe-danger':      'var(--nuqe-danger)',
        'nuqe-warn':        'var(--nuqe-warn)',
        'nuqe-ok':          'var(--nuqe-ok)',
        'nuqe-info':        'var(--nuqe-info)',
      },
      borderColor: {
        DEFAULT: 'var(--nuqe-border)',
      },
    },
  },
  plugins: [],
};
