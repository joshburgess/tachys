import { defineConfig } from "vitepress"

export default defineConfig({
  title: "Tachys",
  description: "A high-performance virtual DOM library optimized for V8",
  base: "/tachys/",
  head: [["link", { rel: "icon", type: "image/svg+xml", href: "/tachys/logo.svg" }]],
  themeConfig: {
    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "API", link: "/api/rendering" },
      { text: "GitHub", link: "https://github.com/joshburgess/tachys" },
    ],
    sidebar: {
      "/guide/": [
        {
          text: "Introduction",
          items: [
            { text: "Getting Started", link: "/guide/getting-started" },
            { text: "JSX Setup", link: "/guide/jsx-setup" },
          ],
        },
        {
          text: "Core Concepts",
          items: [
            { text: "Components", link: "/guide/components" },
            { text: "Hooks", link: "/guide/hooks" },
            { text: "Context", link: "/guide/context" },
            { text: "Events", link: "/guide/events" },
          ],
        },
        {
          text: "Advanced",
          items: [
            { text: "Server-Side Rendering", link: "/guide/ssr" },
            { text: "React Compatibility", link: "/guide/compat" },
            { text: "Performance", link: "/guide/performance" },
          ],
        },
      ],
      "/api/": [
        {
          text: "API Reference",
          items: [
            { text: "Rendering", link: "/api/rendering" },
            { text: "Hooks", link: "/api/hooks" },
            { text: "Components", link: "/api/components" },
            { text: "Context", link: "/api/context" },
            { text: "SSR & Hydration", link: "/api/ssr" },
            { text: "Types & Flags", link: "/api/types" },
          ],
        },
      ],
    },
    socialLinks: [{ icon: "github", link: "https://github.com/joshburgess/tachys" }],
    search: {
      provider: "local",
    },
    footer: {
      message: "Released under the MIT License.",
    },
  },
})
