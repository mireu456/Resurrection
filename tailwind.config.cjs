/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{html,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Display',
          'SF Pro Text',
          'Segoe UI',
          'Helvetica Neue',
          'sans-serif',
        ],
      },
      colors: {
        gray: {
          750: '#2d3748',
        },
        ios: {
          bg: 'rgb(var(--ios-bg) / <alpha-value>)',
          grouped: 'rgb(var(--ios-grouped) / <alpha-value>)',
          elevated: 'rgb(var(--ios-elevated) / <alpha-value>)',
          secondary: 'rgb(var(--ios-secondary) / <alpha-value>)',
          tertiary: 'rgb(var(--ios-tertiary) / <alpha-value>)',
          separator: 'rgb(var(--ios-separator) / <alpha-value>)',
          label: 'rgb(var(--ios-label) / <alpha-value>)',
          'label-secondary': 'rgb(var(--ios-label-secondary) / <alpha-value>)',
          'label-tertiary': 'rgb(var(--ios-label-tertiary) / <alpha-value>)',
          blue: 'rgb(var(--ios-blue) / <alpha-value>)',
          green: 'rgb(var(--ios-green) / <alpha-value>)',
          red: 'rgb(var(--ios-red) / <alpha-value>)',
          orange: 'rgb(var(--ios-orange) / <alpha-value>)',
        },
        resurrection: {
          primary: '#7B3BE6',
          secondary: '#9B9AFF',
          light: '#CCB6FF',
        },
      },
      borderRadius: {
        ios: '10px',
        'ios-lg': '12px',
        'ios-xl': '16px',
      },
      boxShadow: {
        ios: '0 1px 3px var(--ios-shadow)',
        'ios-elevated': '0 4px 12px var(--ios-shadow-elevated)',
      },
      backdropBlur: {
        ios: '20px',
        'ios-heavy': '40px',
      },
      transitionDuration: {
        ios: '200ms',
        'ios-slow': '350ms',
      },
      transitionTimingFunction: {
        ios: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
      },
    },
  },
  plugins: [],
};
