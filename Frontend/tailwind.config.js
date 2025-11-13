/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{html,js,svelte,ts}',
    './**/*.html'
  ],
  darkMode: ['class', '.theme-light'],
  theme: {
    extend: {
      colors: {
        'dark-bg': '#0f172a',
        'dark-card': '#111827',
        'dark-card-alt': '#0b1220',
        'dark-text': '#e5e7eb',
        'dark-muted': '#9ca3af',
        'dark-border': '#1f2937',
      }
    }
  },
  plugins: []
};

