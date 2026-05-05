import type { Config } from "tailwindcss";

/**
 * Tailwind config for the family portal. Theme borrows the senior-app
 * palette (#2A6CF6 brand blue, #1A1F2C ink, #5A6173 muted, #F1F4FB tint)
 * so the two surfaces feel like one product even though their density
 * and audience differ.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#2A6CF6",
          dark: "#1F55C9",
          tint: "#F1F4FB",
        },
        ink: "#1A1F2C",
        muted: "#5A6173",
        line: "#E6E8EF",
        success: "#1F8A4C",
        danger: "#C8312D",
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
