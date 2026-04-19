/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'nuqe-purple':       'var(--nuqe-purple)',
        'nuqe-purple-light': 'var(--nuqe-purple-light)',
        'nuqe-dark':         'var(--nuqe-dark)',
        'nuqe-bg':           'var(--nuqe-bg)',
        'nuqe-surface':      'var(--nuqe-surface)',
        'nuqe-text':         'var(--nuqe-text)',
        'nuqe-muted':        'var(--nuqe-muted)',
        'nuqe-danger':       'var(--nuqe-danger)',
        'nuqe-warn':         'var(--nuqe-warn)',
        'nuqe-ok':           'var(--nuqe-ok)',
      },
    },
  },
  plugins: [],
};
