export default class AuthCap {
  async login(input: any, ctx: any) {
    return { token: 'jwt-token' };
  }

  async verify(input: any, ctx: any) {
    return { valid: true };
  }

  async handleUserBlocked(input: any, ctx: any) {
    return { blocked: true };
  }
}
