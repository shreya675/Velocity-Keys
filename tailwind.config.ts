import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "rgb(var(--color-ink) / <alpha-value>)",
        muted: "rgb(var(--color-muted) / <alpha-value>)",
        panel: "rgb(var(--color-panel) / <alpha-value>)",
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        line: "rgb(var(--color-line) / <alpha-value>)",
        mint: "rgb(var(--color-mint) / <alpha-value>)",
        coral: "rgb(var(--color-coral) / <alpha-value>)",
        brass: "rgb(var(--color-brass) / <alpha-value>)",
        sky: "rgb(var(--color-sky) / <alpha-value>)"
      },
      boxShadow: {
        soft: "0 18px 60px rgb(var(--shadow-color) / 0.18)",
        glow: "0 0 0 1px rgb(var(--color-mint) / 0.16), 0 18px 70px rgb(var(--color-mint) / 0.16)"
      }
    }
  },
  plugins: []
};

export default config;
