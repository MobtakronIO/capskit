/**
 * @mobtakronio/capskit-drizzle — Injectable Drizzle ORM capsule for CapsKit.
 *
 * Provides database access via Drizzle ORM with dynamic driver loading
 * for Postgres (@neondatabase/serverless) and SQLite (better-sqlite3).
 *
 * The capsule is a pure CapsKit registry — the kernel has zero knowledge
 * of how Drizzle is constructed. Users inject the Drizzle instance as a
 * dependency before calling capsKit.start().
 *
 * ## Quick Start
 *
 * ```ts
 * import { createCapsKit } from '@mobtakronio/capskit';
 * import { drizzleCaps, createDrizzleFromEnv } from '@mobtakronio/capskit-drizzle';
 * import { convertRegistryToManifest } from '@mobtakronio/capskit';
 *
 * // Boot Drizzle from env vars (zero framework coupling)
 * const drizzle = await createDrizzleFromEnv();
 *
 * const capsKit = createCapsKit({
 *   dependencies: { drizzle },
 *   capsules: [{ type: 'manifest', manifest: convertRegistryToManifest(drizzleCaps) }],
 * });
 *
 * await capsKit.start();
 * ```
 *
 * ## Manual Injection
 *
 * ```ts
 * import { drizzle } from 'drizzle-orm/node-postgres';
 * import { drizzleCaps } from '@mobtakronio/capskit-drizzle';
 *
 * // User constructs Drizzle however they want
 * const db = drizzle(pool, { schema: mySchema });
 *
 * const capsKit = createCapsKit({
 *   dependencies: { drizzle: db },
 *   capsules: [{ type: 'manifest', manifest: convertRegistryToManifest(drizzleCaps) }],
 * });
 * ```
 */

// Capsule registry (caps.ts + .cap/ pattern)
export { default as drizzleCaps } from './caps';

// Drizzle factory for zero-framework-lock-in bootstrap
export { createDrizzleFromEnv, parsePoolConfig } from './bootstrap';
export type { PoolConfig } from './bootstrap';

// Re-export Cap class + meta for direct .cap directory usage
export { default as DrizzleCap } from './.cap/drizzle/cap';
export { meta as drizzleCapMeta } from './.cap/drizzle/cap.meta';
