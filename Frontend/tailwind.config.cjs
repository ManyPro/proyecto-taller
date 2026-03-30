/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./*.html",
    "./assets/js/**/*.js",
    "./assets/css/**/*.css"
  ],
  darkMode: ["class", ".theme-dark"],
  corePlugins: {
    preflight: false
  },
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#ecfeff",
          100: "#cffafe",
          200: "#a5f3fc",
          300: "#67e8f9",
          400: "#22d3ee",
          500: "#06b6d4",
          600: "#0891b2",
          700: "#0e7490",
          800: "#155e75",
          900: "#164e63"
        },
        accent: {
          50: "#eef2ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          300: "#a5b4fc",
          400: "#818cf8",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
          800: "#3730a3",
          900: "#312e81"
        },
        app: {
          bg: "rgb(var(--ui-bg) / <alpha-value>)",
          card: "rgb(var(--ui-card) / <alpha-value>)",
          muted: "rgb(var(--ui-muted) / <alpha-value>)",
          text: "rgb(var(--ui-text) / <alpha-value>)",
          border: "rgb(var(--ui-border) / <alpha-value>)"
        }
      },
      borderRadius: {
        xl2: "1rem",
        xl3: "1.25rem"
      },
      boxShadow: {
        soft: "0 10px 30px rgba(15, 23, 42, 0.16)",
        card: "0 10px 30px rgba(2, 6, 23, 0.24)"
      }
    }
  },
  safelist: [
    {
      pattern: /(bg|text|border|from|to|via)-(slate|blue|green|red|yellow|purple|indigo|emerald|cyan)-(50|100|200|300|400|500|600|700|800|900)(\/\d+)?/
    }
  ]
};
