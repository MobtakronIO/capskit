import { DependencyError } from '@mobtakronio/capskit';
import { drizzleRepository } from '../repository/drizzle.repository';

export const meta = {
  name: 'transaction',
};

export default async function transaction(input: any, ctx: any) {
  const db = ctx.deps.drizzle;
  if (!db) throw new DependencyError('Drizzle ORM not injected');
  const results = await drizzleRepository.transaction(db, input.body.operations);
  return { results };
}
