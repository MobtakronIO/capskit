import { CapsuleRegistry } from '../../../src/kernel/cap-loader';

class MathCap {
  async sum(input: any, ctx: any) {
    const { a, b } = input.body;
    return { result: a + b };
  }

  async multiply(input: any, ctx: any) {
    const { a, b } = input.body;
    return { result: a * b };
  }
}

class StringCap {
  async concat(input: any, ctx: any) {
    const { a, b } = input.body;
    return { result: `${a}${b}` };
  }
}

export default {
  name: 'utils',
  caps: [
    {
      class: MathCap,
      meta: {
        name: 'math',
        routes: [
          { method: 'POST', path: '/math/sum', action: 'sum' },
          { method: 'POST', path: '/math/multiply', action: 'multiply' },
        ],
        events: {
          publishes: ['math.completed'],
        },
        dependencies: ['db'],
      },
    },
    {
      class: StringCap,
      meta: {
        name: 'string',
        routes: [
          { method: 'POST', path: '/string/concat', action: 'concat' },
        ],
        events: {
          subscribes: [
            { event: 'math.completed', action: 'concat' },
          ],
        },
        dependencies: ['cache'],
      },
    },
  ],
} satisfies CapsuleRegistry;
