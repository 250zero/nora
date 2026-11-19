/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      colors: {
        nora: {
          bg: {
            dark: '#0B0F19',
            light: '#F8FAFC',
          },
          surface: {
            dark: '#151D2C',
            light: '#FFFFFF',
            elevatedDark: '#1E293B',
            elevatedLight: '#FFFFFF',
          },
          border: {
            dark: '#222F43',
            light: '#E2E8F0',
          },
          primary: {
            DEFAULT: '#2563EB',
            hover: '#1D4ED8',
            light: '#3B82F6',
          },
          ai: {
            spark: '#A855F7',
            glow: '#38BDF8',
          }
        }
      },
      boxShadow: {
        'nora-fab': '0 8px 24px -4px rgba(37, 99, 235, 0.45)',
        'nora-card-dark': '0 4px 16px -2px rgba(0, 0, 0, 0.35)',
      }
    }
  },
  plugins: [],
};
