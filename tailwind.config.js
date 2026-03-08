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
        bg: '#050507',
        'card-bg': 'rgba(20, 20, 25, 0.6)',
        'accent-green': '#00E676',
        'accent-yellow': '#FFD60A',
        'accent-red': '#FF3B30',
        'accent-blue': '#1E807D',
        'accent-purple': '#2A9D8F',
        'accent-gold': '#FFD700',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    },
  },
  plugins: [],
}