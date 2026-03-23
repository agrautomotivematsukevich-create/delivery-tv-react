/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        bg: '#191B25',
        'card-bg': 'rgba(58, 60, 78, 0.35)',
        'accent-green': '#00E676',
        'accent-yellow': '#E89F64',
        'accent-red': '#FF3B30',
        'accent-blue': '#1E7D7D',
        'accent-purple': '#053838',
        'accent-gold': '#E89F64',
        'agr-dark': '#3A3C4E',
        'agr-gray': '#5C5E74',
        'agr-light': '#BDBFD1',
        'agr-green': '#1E7D7D',
        'agr-dark-green': '#053838',
        'agr-orange': '#E89F64',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    },
  },
  plugins: [],
}
