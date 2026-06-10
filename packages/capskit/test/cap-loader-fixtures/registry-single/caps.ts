import { CapsuleRegistry } from '../../../src/kernel/cap-loader';

class GreetCap {
  async hello(input: any, ctx: any) {
    return { message: `Hello, ${input.body.name || 'World'}!` };
  }

  async goodbye(input: any, ctx: any) {
    return { message: `Goodbye, ${input.body.name || 'World'}!` };
  }
}

export default {
  name: 'greeter',
  caps: [
    {
      class: GreetCap,
      meta: {
        name: 'greet',
        routes: [
          { method: 'POST', path: '/greet/hello', action: 'hello' },
          { method: 'POST', path: '/greet/goodbye', action: 'goodbye' },
        ],
        events: {
          publishes: ['greet.hello', 'greet.goodbye'],
        },
        dependencies: ['logger'],
      },
    },
  ],
} satisfies CapsuleRegistry;
