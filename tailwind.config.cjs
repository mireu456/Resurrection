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
          bg: '#000000',
          grouped: '#0c0c0e',
          elevated: '#1c1c1e',
          secondary: '#2c2c2e',
          tertiary: '#3a3a3c',
          separator: '#38383a',
          label: '#ffffff',
          'label-secondary': '#8e8e93',
          'label-tertiary': '#636366',
          blue: '#7B3BE6',
          green: '#30d158',
          red: '#ff453a',
          orange: '#ff9f0a',
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
        ios: '0 1px 3px rgba(0,0,0,0.3)',
        'ios-elevated': '0 4px 12px rgba(0,0,0,0.4)',
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
