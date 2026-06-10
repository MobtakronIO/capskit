import { DependencyError } from '@mobtakronio/capskit';
import { drizzleRepository } from '../repository/drizzle.repository';

export const meta = {
  name: 'execute',
};

export default async function execute(input: any, ctx: any) {
  const db = ctx.deps.drizzle;
  if (!db) throw new DependencyError('Drizzle ORM not injected');
  const result = await drizzleRepository.execute(db, input.body);
  return { result };
}
