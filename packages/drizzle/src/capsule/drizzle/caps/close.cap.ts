import { drizzleRepository } from '../repository/drizzle.repository';

export const meta = {
  name: 'close',
  kind: 'action',
};

export default async function close(input: any, ctx: any) {
  const db = ctx.deps.drizzle;
  if (!db) throw new Error('Drizzle ORM not injected');
  return drizzleRepository.close(db);
}
