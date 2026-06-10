import { DependencyError } from '@mobtakronio/capskit';
import { drizzleRepository } from '../repository/drizzle.repository';

export const meta = {
  name: 'health',
};

export default async function health(input: any, ctx: any) {
  const db = ctx.deps.drizzle;
  if (!db) throw new DependencyError('Drizzle ORM not injected');
  return drizzleRepository.health(db);
}
