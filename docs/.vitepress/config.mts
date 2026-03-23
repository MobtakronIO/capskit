import { defineConfig } from 'vitepress'

export default defineConfig({
  title: "CapsKit",
  description: "The Framework-Agnostic Capability Runtime",
  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Guide', link: '/guide/introduction' },
      { text: 'Examples', link: '/guide/examples/quick' }
    ],
    sidebar: [
      {
        text: 'Getting Started',
        items: [
          { text: 'Introduction', link: '/guide/introduction' },
          { text: 'Philosophy', link: '/guide/philosophy' },
          { text: 'Quick Start', link: '/guide/quick-start' }
        ]
      },
      {
        text: 'Core Concepts',
        items: [
          { text: 'Architecture Overview', link: '/guide/architecture' },
          { text: 'Capsules & Manifests', link: '/guide/capsules' },
          { text: 'Actions & Handlers', link: '/guide/actions' },
          { text: 'Action Hooks', link: '/guide/hooks' },
          { text: 'Capsule Clients', link: '/guide/clients' },
          { text: 'Dependencies', link: '/guide/dependencies' }
        ]
      },
      {
        text: 'Adapters',
        items: [
          { text: 'HTTP Adapter', link: '/guide/adapters/http' },
          { text: 'WebSocket Adapter', link: '/guide/adapters/websocket' }
        ]
      },
      {
        text: 'Advanced Guide',
        items: [
          { text: 'Kernel Interceptors', link: '/guide/interceptors' },
          { text: 'Route Traits', link: '/guide/traits' },
          { text: 'Event Bus', link: '/guide/events' },
          { text: 'Loader & Discovery', link: '/guide/loader' },
          { text: 'Error Handling', link: '/guide/errors' },
          { text: 'Testing', link: '/guide/testing' }
        ]
      },
      {
        text: 'Examples',
        items: [
          { text: 'Quick Examples', link: '/guide/examples/quick' },
          { text: 'Full Project', link: '/guide/examples/full-project' }
        ]
      }
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/MobtakronIO/capskit' }
    ],
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026-present MobtakronIO'
    }
  }
})
