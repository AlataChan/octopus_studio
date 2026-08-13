/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
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
      "./node_modules/@tremor/**/*.{js,ts,jsx,tsx}"
    ]
  },
  theme: {
    extend: {
      rotate: {
        "270": "270deg",
        "360": "360deg"
      },
      colors: {
        "black-900": "var(--theme-bg-primary)",
        accent: "var(--theme-accent-primary)",
        "sidebar-button": "var(--theme-settings-input-bg)",
        sidebar: "var(--theme-bg-sidebar)",
        "historical-msg-system": "rgba(240, 128, 60, 0.1)",
        "historical-msg-user": "var(--theme-bg-secondary)",
        outline: "var(--theme-accent-primary)",
        "primary-button": "var(--theme-button-primary)",
        "primary-button-hover": "var(--theme-button-primary-hover)",
        "cta-button": "var(--theme-button-cta)",
        secondary: "var(--theme-bg-sidebar)",
        "dark-input": "var(--theme-bg-chat-input)",
        "mobile-onboarding": "var(--theme-bg-sidebar)",
        "dark-highlight": "var(--theme-accent-soft)",
        "dark-text": "#1A0E05",
        description: "var(--theme-text-secondary)",
        "x-button": "var(--theme-text-secondary)",
        royalblue: "var(--theme-accent-primary)",
        purple: "#4A1FB8",
        magenta: "#9E165F",
        danger: "#F04438",
        error: "#B42318",
        warn: "#FEC84B",
        success: "#05603A",
        darker: "#E8F1F5",
        teal: "#00F0FF",

        // Generic theme colors
        theme: {
          // 主题强调色（用于标签、高亮等）
          accent: {
            primary: "var(--theme-accent-primary)"
          },
          // 边框颜色
          border: "var(--theme-border)",
          bg: {
            primary: "var(--theme-bg-primary)",
            secondary: "var(--theme-bg-secondary)",
            sidebar: "var(--theme-bg-sidebar)",
            container: "var(--theme-bg-container)",
            chat: "var(--theme-bg-chat)",
            "chat-input": "var(--theme-bg-chat-input)",
            "popup-menu": "var(--theme-popup-menu-bg)"
          },
          text: {
            primary: "var(--theme-text-primary)",
            secondary: "var(--theme-text-secondary)",
            placeholder: "var(--theme-placeholder)"
          },
          sidebar: {
            item: {
              default: "var(--theme-sidebar-item-default)",
              selected: "var(--theme-sidebar-item-selected)",
              hover: "var(--theme-sidebar-item-hover)"
            },
            subitem: {
              default: "var(--theme-sidebar-subitem-default)",
              selected: "var(--theme-sidebar-subitem-selected)",
              hover: "var(--theme-sidebar-subitem-hover)"
            },
            footer: {
              icon: "var(--theme-sidebar-footer-icon)",
              "icon-hover": "var(--theme-sidebar-footer-icon-hover)"
            },
            border: "var(--theme-sidebar-border)"
          },
          "chat-input": {
            border: "var(--theme-chat-input-border)"
          },
          "action-menu": {
            bg: "var(--theme-action-menu-bg)",
            "item-hover": "var(--theme-action-menu-item-hover)"
          },
          settings: {
            input: {
              bg: "var(--theme-settings-input-bg)",
              active: "var(--theme-settings-input-active)",
              placeholder: "var(--theme-settings-input-placeholder)",
              text: "var(--theme-settings-input-text)"
            }
          },
          modal: {
            border: "var(--theme-modal-border)"
          },
          "file-picker": {
            hover: "var(--theme-file-picker-hover)"
          },
          attachment: {
            bg: "var(--theme-attachment-bg)",
            "error-bg": "var(--theme-attachment-error-bg)",
            "success-bg": "var(--theme-attachment-success-bg)",
            text: "var(--theme-attachment-text)",
            "text-secondary": "var(--theme-attachment-text-secondary)",
            icon: "var(--theme-attachment-icon)",
            "icon-spinner": "var(--theme-attachment-icon-spinner)",
            "icon-spinner-bg": "var(--theme-attachment-icon-spinner-bg)"
          },
          home: {
            text: "var(--theme-home-text)",
            "text-secondary": "var(--theme-home-text-secondary)",
            "bg-card": "var(--theme-home-bg-card)",
            "bg-button": "var(--theme-home-bg-button)",
            border: "var(--theme-home-border)",
            "button-primary": "var(--theme-home-button-primary)",
            "button-primary-hover": "var(--theme-home-button-primary-hover)",
            "button-secondary": "var(--theme-home-button-secondary)",
            "button-secondary-hover":
              "var(--theme-home-button-secondary-hover)",
            "button-secondary-text": "var(--theme-home-button-secondary-text)",
            "button-secondary-hover-text":
              "var(--theme-home-button-secondary-hover-text)",
            "button-secondary-border":
              "var(--theme-home-button-secondary-border)",
            "button-secondary-border-hover":
              "var(--theme-home-button-secondary-border-hover)",
            "update-card-bg": "var(--theme-home-update-card-bg)",
            "update-card-hover": "var(--theme-home-update-card-hover)",
            "update-source": "var(--theme-home-update-source)"
          },
          checklist: {
            "item-bg": "var(--theme-checklist-item-bg)",
            "item-bg-hover": "var(--theme-checklist-item-bg-hover)",
            "item-text": "var(--theme-checklist-item-text)",
            "item-completed-bg": "var(--theme-checklist-item-completed-bg)",
            "item-completed-text": "var(--theme-checklist-item-completed-text)",
            "item-hover": "var(--theme-checklist-item-hover)",
            "checkbox-border": "var(--theme-checklist-checkbox-border)",
            "checkbox-fill": "var(--theme-checklist-checkbox-fill)",
            "checkbox-text": "var(--theme-checklist-checkbox-text)",
            "button-border": "var(--theme-checklist-button-border)",
            "button-text": "var(--theme-checklist-button-text)",
            "button-hover-bg": "var(--theme-checklist-button-hover-bg)",
            "button-hover-border": "var(--theme-checklist-button-hover-border)"
          },
          button: {
            text: "var(--theme-button-text)",
            "code-hover-text": "var(--theme-button-code-hover-text)",
            "code-hover-bg": "var(--theme-button-code-hover-bg)",
            "disable-hover-text": "var(--theme-button-disable-hover-text)",
            "disable-hover-bg": "var(--theme-button-disable-hover-bg)",
            "delete-hover-text": "var(--theme-button-delete-hover-text)",
            "delete-hover-bg": "var(--theme-button-delete-hover-bg)"
          },
          "border-subtle": "var(--theme-border-subtle)",
          "border-medium": "var(--theme-border-medium)",
          "border-strong": "var(--theme-border-strong)",
          stroke: {
            primary: "var(--theme-stroke-primary)",
            secondary: "var(--theme-stroke-secondary)",
            muted: "var(--theme-stroke-muted)"
          }
        }
      },
      backgroundImage: {
        "preference-gradient":
          "linear-gradient(180deg, var(--theme-bg-secondary) 0%, var(--theme-bg-chat-input) 100%);",
        "selected-preference-gradient":
          "linear-gradient(180deg, var(--theme-accent-soft) 0%, rgba(240, 128, 60, 0.04) 100%);"
      },
      fontFamily: {
        sans: [
          "Plus Jakarta Sans",
          "plus-jakarta-sans",
          "Noto Sans SC",
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
        sweep: "sweep 0.5s ease-in-out",
        "pulse-glow": "pulse-glow 1.5s infinite",
        "fade-in": "fade-in 0.3s ease-out",
        "slide-up": "slide-up 0.4s ease-out forwards",
        "bounce-subtle": "bounce-subtle 2s ease-in-out infinite",
        sonar: "sonar 2s ease-out infinite"
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
        },
        "pulse-glow": {
          "0%": {
            opacity: 1,
            transform: "scale(1)",
            boxShadow: "0 0 0 rgba(255, 255, 255, 0.0)",
            backgroundColor: "rgba(255, 255, 255, 0.0)"
          },
          "50%": {
            opacity: 1,
            transform: "scale(1.1)",
            boxShadow: "0 0 15px rgba(255, 255, 255, 0.2)",
            backgroundColor: "rgba(255, 255, 255, 0.1)"
          },
          "100%": {
            opacity: 1,
            transform: "scale(1)",
            boxShadow: "0 0 0 rgba(255, 255, 255, 0.0)",
            backgroundColor: "rgba(255, 255, 255, 0.0)"
          }
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" }
        },
        "slide-up": {
          "0%": { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" }
        },
        "bounce-subtle": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-2px)" }
        },
        sonar: {
          "0%": { transform: "scale(1)", opacity: "0.5" },
          "100%": { transform: "scale(2.6)", opacity: "0" }
        }
      },
      zIndex: {
        base: "var(--z-base)",
        sticky: "var(--z-sticky)",
        dropdown: "var(--z-dropdown)",
        overlay: "var(--z-overlay)",
        modal: "var(--z-modal)",
        popover: "var(--z-popover)",
        toast: "var(--z-toast)",
        tooltip: "var(--z-tooltip)",
      },
      maxWidth: {
        chat: "var(--chat-content-width)",
      },
    }
  },
  variants: {
    extend: {
      backgroundColor: ["light"],
      textColor: ["light"]
    }
  },
  // Required for rechart styles to show since they can be rendered dynamically and will be tree-shaken if not safe-listed.
  safelist: [
    {
      pattern:
        /^(bg-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950))$/,
      variants: ["hover", "ui-selected"]
    },
    {
      pattern:
        /^(text-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950))$/,
      variants: ["hover", "ui-selected"]
    },
    {
      pattern:
        /^(border-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950))$/,
      variants: ["hover", "ui-selected"]
    },
    {
      pattern:
        /^(ring-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950))$/
    },
    {
      pattern:
        /^(stroke-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950))$/
    },
    {
      pattern:
        /^(fill-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950))$/
    }
  ],
  plugins: [
    function ({ addVariant }) {
      addVariant("light", ".light &") // Add the `light:` variant
    }
  ]
}
