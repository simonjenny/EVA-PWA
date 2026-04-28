/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{vue,js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        'ios-blue': '#0A84FF',
        'ios-gray': '#F2F2F7',
        'ios-dark': '#1C1C1E',
        'ios-secondary': '#8E8E93',
        'ios-separator': '#C6C6C8',
        'ios-dark-bg': '#121214',
        'ios-dark-card': '#242426',
        'ios-dark-elevated': '#2F2F33',
        'ios-dark-separator': '#3C3C3F'
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Display',
          'SF Pro Text',
          'Helvetica Neue',
          'Arial',
          'sans-serif'
        ]
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem'
      },
      animation: {
        'spin-reverse': 'spin-reverse 1s linear infinite'
      },
      keyframes: {
        'spin-reverse': {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(-360deg)' }
        }
      }
    }
  },
  plugins: []
}
