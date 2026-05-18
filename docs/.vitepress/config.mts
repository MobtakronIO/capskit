import { defineConfig } from 'vitepress'

export default defineConfig({
  title: "CapsKit",
  description: "The Framework-Agnostic Capability Runtime",
  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Guide', link: '/guide/quick-start' }
    ],
    sidebar: [
      {
        text: 'Getting Started',
        items: [
          { text: 'Philosophy', link: '/guide/philosophy' },
          { text: 'Quick Start', link: '/guide/quick-start' },
          { text: 'Architecture Overview', link: '/guide/architecture' }
        ]
      },
      {
        text: 'Core Concepts',
        items: [
          { text: 'Capsules', link: '/guide/capsules' },
          { text: 'Caps', link: '/guide/caps' },
          { text: 'Hooks', link: '/guide/hooks' },
          { text: 'Events', link: '/guide/events' },
          { text: 'Dependencies', link: '/guide/dependencies' },
          { text: 'Conventions', link: '/guide/conventions' }
        ]
      },
      {
        text: 'Client SDK',
        items: [
          { text: 'Client', link: '/guide/client' },
          { text: 'Interceptors', link: '/guide/interceptors' },
          { text: 'Offline Queue', link: '/guide/offline' },
          { text: 'WebSocket Protocol', link: '/guide/websocket' },
          { text: 'Type Generator', link: '/guide/type-generator' }
        ]
      },
      {
        text: 'Frontend Integration',
        items: [
          { text: 'React Hooks', link: '/guide/react' },
          { text: 'Vue Composables', link: '/guide/vue' }
        ]
      },
      {
        text: 'Built-in Capsules',
        items: [
          { text: 'Overview', link: '/guide/built-in-capsules' }
        ]
      },
      {
        text: 'Error Handling',
        items: [
          { text: 'Errors', link: '/guide/errors' }
        ]
      },
      {
        text: 'Testing',
        items: [
          { text: 'Testing', link: '/guide/testing' }
        ]
      },
      {
        text: 'Plugins',
        items: [
          { text: 'Adapter Contract', link: '/plugins/adapter-contract' }
        ]
      },
      {
        text: 'Init Examples',
        items: [
          { text: 'Examples', link: '/init-examples' }
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
