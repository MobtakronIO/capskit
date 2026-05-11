export default class CalculatorCap {
  async sum(input: any, ctx: any) {
    const { a, b } = input.body;
    return { result: a + b };
  }

  async multiply(input: any, ctx: any) {
    const { a, b } = input.body;
    return { result: a * b };
  }
}
