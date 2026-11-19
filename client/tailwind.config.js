/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './client/index.html',
    './client/src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        track: {
          orange: '#FF5500',
          'orange-dark': '#E04800',
          blue: '#0066FF',
          'blue-dark': '#004ECC',
          dark: '#0B1120',
          slate: '#1E293B',
        },
      },
      fontFamily: {
        sans: ['"Noto Sans TC"', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['"Chakra Petch"', '"Noto Sans TC"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
