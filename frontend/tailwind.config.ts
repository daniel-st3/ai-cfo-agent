import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: "var(--card)",
        "card-foreground": "var(--card-foreground)",
        border: "var(--border)",
        muted: "var(--muted)",
        "muted-foreground": "var(--muted-foreground)",
        accent: "var(--accent)",
        "accent-foreground": "var(--accent-foreground)",
        destructive: "var(--destructive)",
        primary: "var(--primary)",
        "primary-foreground": "var(--primary-foreground)",
        ring: "var(--ring)",
        "chart-1": "var(--chart-1)",
        "chart-2": "var(--chart-2)",
        "chart-3": "var(--chart-3)",
        "chart-4": "var(--chart-4)",
        "chart-5": "var(--chart-5)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      keyframes: {
        "pulse-ring": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.4", transform: "scale(1.08)" },
        },
        "sweep-right": {
          "0%": { transform: "scaleX(0)", transformOrigin: "left" },
          "100%": { transform: "scaleX(1)", transformOrigin: "left" },
        },
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pop-in": {
          "0%": { transform: "scale(0.85)", opacity: "0" },
          "60%": { transform: "scale(1.08)" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "dot-blink": {
          "0%, 80%, 100%": { opacity: "0" },
          "40%": { opacity: "1" },
        },
        "glow-pulse": {
          "0%, 100%": { boxShadow: "0 0 0px #2563EB" },
          "50%": { boxShadow: "0 0 20px 4px #2563EB80" },
        },
        "celebrate": {
          "0%": { boxShadow: "0 0 0px #22C55E" },
          "50%": { boxShadow: "0 0 28px 6px #22C55E80" },
          "100%": { boxShadow: "0 0 0px #22C55E" },
        },
      },
      animation: {
        "pulse-ring": "pulse-ring 1.5s ease-in-out infinite",
        "sweep-right": "sweep-right 0.6s ease-in-out forwards",
        "fade-in-up": "fade-in-up 0.5s ease-out forwards",
        "pop-in": "pop-in 0.4s ease-out forwards",
        "dot-1": "dot-blink 1.4s 0.0s infinite",
        "dot-2": "dot-blink 1.4s 0.2s infinite",
        "dot-3": "dot-blink 1.4s 0.4s infinite",
        "glow-pulse": "glow-pulse 1.5s ease-in-out infinite",
        "celebrate": "celebrate 0.8s ease-out forwards",
      },
    },
  },
  plugins: [],
};
export default config;
