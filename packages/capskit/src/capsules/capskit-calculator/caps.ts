import type { CapsuleRegistry, CapMeta } from '../../kernel/cap-loader';

export class CalculatorCap {
  async sum(payload: any, _context: any) {
    const { a, b } = payload?.body || payload || {};
    return { result: a + b };
  }

  async subtract(payload: any, _context: any) {
    const { a, b } = payload?.body || payload || {};
    return { result: a - b };
  }

  async multiply(payload: any, _context: any) {
    const { a, b } = payload?.body || payload || {};
    return { result: a * b };
  }

  async divide(payload: any, _context: any) {
    const { a, b } = payload?.body || payload || {};
    if (b === 0) throw new Error('Division by zero');
    return { result: a / b };
  }
}

const calcMeta: CapMeta = {
  name: 'calculator',
  kind: 'action',
  dependencies: [],
  actions: {
    sum: { description: 'Adds two numbers' },
    subtract: { description: 'Subtracts two numbers' },
    multiply: { description: 'Multiplies two numbers' },
    divide: { description: 'Divides two numbers' },
  },
};

const registry: CapsuleRegistry = {
  name: 'capskit-calculator',
  caps: [
    { class: CalculatorCap, meta: calcMeta },
  ],
};

export default registry;
