import { drizzleRepository } from '../repository/drizzle.repository';

export const meta = {
  name: 'query',
};

export default async function query(input: any, ctx: any) {
  const db = ctx.deps.drizzle;
  if (!db) throw new Error('Drizzle ORM not injected');
  const result = await drizzleRepository.query(db, input.body);
  return { data: result };
}
