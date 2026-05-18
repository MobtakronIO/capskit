import { drizzleRepository } from '../repository/drizzle.repository';

export const meta = {
  name: 'execute',
  kind: 'action',
};

export default async function execute(input: any, ctx: any) {
  const db = ctx.deps.drizzle;
  if (!db) throw new Error('Drizzle ORM not injected');
  const result = await drizzleRepository.execute(db, input.body);
  return { result };
}
