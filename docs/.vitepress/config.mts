import { defineConfig } from 'vitepress'

export default defineConfig({
  title: "CapsKit",
  description: "The Framework-Agnostic Capability Runtime",
  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Guide', link: '/guide/introduction' }
    ],
    sidebar: [
      {
        text: 'Getting Started',
        items: [
          { text: 'Introduction', link: '/guide/introduction' },
          { text: 'Quick Start', link: '/guide/quick-start' }
        ]
      },
      {
        text: 'Core Concepts',
        items: [
          { text: 'Manifests & Actions', link: '/guide/core/manifests' },
          { text: 'Action Pre/Post Hooks', link: '/guide/core/hooks' },
          { text: 'Capsule Clients', link: '/guide/core/clients' }
        ]
      },
      {
        text: 'Advanced Architecture',
        items: [
          { text: 'Kernel Interceptors', link: '/guide/advanced/interceptors' },
          { text: 'HTTP Route Traits', link: '/guide/advanced/traits' },
          { text: 'Event Bus (Pub/Sub)', link: '/guide/advanced/event-bus' }
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
