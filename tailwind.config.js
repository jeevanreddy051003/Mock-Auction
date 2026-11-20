/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        obsidian: '#0B0D0E',
        surface: '#121517',
        surfaceElevated: '#181C1F',
        neonBlue: '#00E5FF',
        electricSky: '#38BDF8',
      }
    },
  },
  plugins: [],
}
