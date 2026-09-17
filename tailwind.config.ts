import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        paper: "#FAF8F4",
        card: "#FFFFFF",
        ink: "#1C1B18",
        muted: "#6B6558",
        line: "#E9E2D6",
        beige: {
          50: "#FBF9F5",
          100: "#F4EEE3",
          200: "#E8DFD0",
          300: "#D8C9AE",
          400: "#C2AC85",
          500: "#A8895F"
        },
        band: {
          bad: "#DC2626",
          badBg: "#FEF2F2",
          normal: "#D97706",
          normalBg: "#FFFBEB",
          good: "#16A34A",
          goodBg: "#F0FDF4",
          hot: "#059669",
          hotBg: "#ECFDF5"
        }
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Inter",
          "Helvetica Neue",
          "Arial",
          "sans-serif"
        ],
        serif: ["Georgia", "Iowan Old Style", "Palatino Linotype", "serif"]
      },
      boxShadow: {
        soft: "0 1px 2px rgba(28,27,24,0.04), 0 8px 24px rgba(28,27,24,0.06)",
        card: "0 1px 3px rgba(28,27,24,0.05), 0 1px 2px rgba(28,27,24,0.04)"
      },
      borderRadius: {
        xl2: "1.25rem"
      }
    }
  },
  plugins: []
};

export default config;
