/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        felt: '#276221',
        'felt-dark': '#1a4016',
      },
    },
  },
  plugins: [],
};
