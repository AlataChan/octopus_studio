/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'false',
  prefix: 'allm-',
  corePlugins: {
    preflight: false,
  },
  content: {
    relative: true,
    files: [
      "./src/components/**/*.{js,jsx}",
      "./src/hooks/**/*.js",
      "./src/models/**/*.js",
      "./src/pages/**/*.{js,jsx}",
      "./src/utils/**/*.js",
      "./src/*.jsx",
      "./index.html",
    ]
  },
  theme: {
    extend: {
      rotate: {
        "270": "270deg",
        "360": "360deg"
      },
      colors: {
        "black-900": "#013153",
        accent: "#2E8AAB",
        "sidebar-button": "#1A6B8A",
        sidebar: "#013153",
        "historical-msg-system": "rgba(0, 217, 255, 0.1);",
        "historical-msg-user": "#0A4D6E",
        outline: "#2E8AAB",
        "primary-button": "#00D9FF",
        secondary: "#0A4D6E",
        "dark-input": "#013153",
        "mobile-onboarding": "#0A4D6E",
        "dark-highlight": "#1A6B8A",
        "dark-text": "#013153",
        description: "#A8C5DA",
        "x-button": "#7AA8C2"
      },
      backgroundImage: {
        "preference-gradient":
          "linear-gradient(180deg, #2E8AAB 0%, rgba(46, 138, 171, 0.28) 100%);",
        "chat-msg-user-gradient":
          "linear-gradient(180deg, #1A6B8A 0%, #0A4D6E 100%);",
        "selected-preference-gradient":
          "linear-gradient(180deg, #2E8AAB 0%, rgba(46, 138, 171, 0) 100%);",
        "main-gradient": "linear-gradient(180deg, #1A6B8A 0%, #0A4D6E 100%)",
        "modal-gradient": "linear-gradient(180deg, #1B4F7A 0%, #144272 100%)",
        "sidebar-gradient": "linear-gradient(90deg, #2C74B3 0%, #1B4F7A 100%)",
        "login-gradient": "linear-gradient(180deg, #1B4F7A 0%, #0A2647 100%)",
        "menu-item-gradient":
          "linear-gradient(90deg, #1B4F7A 0%, #144272 100%)",
        "menu-item-selected-gradient":
          "linear-gradient(90deg, #2C74B3 0%, #1B4F7A 100%)",
        "workspace-item-gradient":
          "linear-gradient(90deg, #1B4F7A 0%, #144272 100%)",
        "workspace-item-selected-gradient":
          "linear-gradient(90deg, #2C74B3 0%, #1B4F7A 100%)",
        "switch-selected": "linear-gradient(146deg, #2C74B3 0%, #1B4F7A 100%)"
      },
      fontFamily: {
        sans: [
          "plus-jakarta-sans",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Roboto",
          '"Helvetica Neue"',
          "Arial",
          '"Noto Sans"',
          "sans-serif",
          '"Apple Color Emoji"',
          '"Segoe UI Emoji"',
          '"Segoe UI Symbol"',
          '"Noto Color Emoji"'
        ]
      },
      animation: {
        sweep: "sweep 0.5s ease-in-out"
      },
      keyframes: {
        sweep: {
          "0%": { transform: "scaleX(0)", transformOrigin: "bottom left" },
          "100%": { transform: "scaleX(1)", transformOrigin: "bottom left" }
        },
        fadeIn: {
          "0%": { opacity: 0 },
          "100%": { opacity: 1 }
        },
        fadeOut: {
          "0%": { opacity: 1 },
          "100%": { opacity: 0 }
        }
      }
    }
  },
  plugins: []
}
