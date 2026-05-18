import { drizzleRepository } from '../repository/drizzle.repository';

export const meta = {
  name: 'migrate',
  kind: 'action',
};

export default async function migrate(input: any, ctx: any) {
  const db = ctx.deps.drizzle;
  if (!db) throw new Error('Drizzle ORM not injected');
  const result = await drizzleRepository.migrate(db, input.body.path);
  return result;
}
