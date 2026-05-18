import { drizzleRepository } from '../repository/drizzle.repository';

export const meta = {
  name: 'health',
  kind: 'action',
};

export default async function health(input: any, ctx: any) {
  const db = ctx.deps.drizzle;
  if (!db) throw new Error('Drizzle ORM not injected');
  return drizzleRepository.health(db);
}
