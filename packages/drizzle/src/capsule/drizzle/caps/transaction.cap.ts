import { drizzleRepository } from '../repository/drizzle.repository';

export const meta = {
  name: 'transaction',
  kind: 'action',
};

export default async function transaction(input: any, ctx: any) {
  const db = ctx.deps.drizzle;
  if (!db) throw new Error('Drizzle ORM not injected');
  const results = await drizzleRepository.transaction(db, input.body.operations);
  return { results };
}
