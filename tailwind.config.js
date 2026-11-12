/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/sidepanel/index.html',
    './src/sidepanel/**/*.ts',
    './src/**/*.{html,ts}',
  ],
  theme: {
    extend: {
      colors: {
        canvas: '#F8FAFC',
        surface: '#FFFFFF',
        'surface-subtle': '#F1F5F9',
        'border-soft': '#E2E8F0',
        'border-subtle': '#EDF2F7',
        primary: {
          DEFAULT: '#4F46E5',
          hover: '#4338CA',
          soft: '#EEF2FF',
          text: '#3730A3',
        },
        ink: {
          base: '#0F172A',
          secondary: '#475569',
          muted: '#94A3B8',
        },
        sage: {
          DEFAULT: '#059669',
          soft: '#ECFDF5',
          border: '#A7F3D0',
          text: '#065F46',
        },
        amber: {
          DEFAULT: '#D97706',
          soft: '#FFFBEB',
          border: '#FDE68A',
          text: '#92400E',
        },
        rose: {
          DEFAULT: '#E11D48',
          soft: '#FFF1F2',
          border: '#FECDD3',
          text: '#9F1239',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'sans-serif',
        ],
      },
      boxShadow: {
        soft: '0 1px 3px 0 rgba(0, 0, 0, 0.04), 0 1px 2px -1px rgba(0, 0, 0, 0.04)',
        card: '0 2px 6px -1px rgba(0, 0, 0, 0.05), 0 1px 4px -1px rgba(0, 0, 0, 0.03)',
        floating: '0 10px 25px -3px rgba(0, 0, 0, 0.06), 0 4px 6px -2px rgba(0, 0, 0, 0.03)',
      },
    },
  },
  plugins: [],
};
