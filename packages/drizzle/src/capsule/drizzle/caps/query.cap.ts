import { DependencyError } from '@mobtakronio/capskit';
import { drizzleRepository } from '../repository/drizzle.repository';

export const meta = {
  name: 'query',
};

export default async function query(input: any, ctx: any) {
  const db = ctx.deps.drizzle;
  if (!db) throw new DependencyError('Drizzle ORM not injected');
  const result = await drizzleRepository.query(db, input.body);
  return { data: result };
}
