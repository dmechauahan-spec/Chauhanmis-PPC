import { PrismaClient } from '@prisma/client';
import type { ITXClientDenyList } from '@prisma/client/runtime/library';
import { env } from '../config/env';
import { withRetry } from './withRetry';

// Model-level read operations only. Writes (create/update/delete/upsert/
// *Many) are excluded because a write can partially succeed before a
// connection drops — retrying it risks re-applying (duplicating) a mutation
// that already landed. Raw queries ($queryRaw/$executeRaw) are also excluded:
// this codebase uses $queryRaw for a Postgres nextval()/setval() pair in
// qc.service.ts, which has side effects despite the "read" shape, and there's
// no generic way to tell a pure SELECT apart from that at this layer — so all
// raw queries are left unwrapped rather than guessing. Those operations rely
// on Neon's connection stability instead. See README "Connectivity
// resilience".
const RETRYABLE_READ_OPERATIONS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findUnique',
  'findUniqueOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]);

function createPrismaClient() {
  return new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  }).$extends({
    query: {
      $allOperations({ operation, args, query }) {
        if (!RETRYABLE_READ_OPERATIONS.has(operation)) {
          return query(args);
        }
        return withRetry(() => query(args));
      },
    },
  });
}

declare global {
  // eslint-disable-next-line no-var
  var __prisma: ReturnType<typeof createPrismaClient> | undefined;
}

// Reuse a single client across hot reloads / test imports instead of opening
// a fresh pool per import.
export const prisma = global.__prisma ?? createPrismaClient();

if (env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}

// Replaces `Prisma.TransactionClient` (which is bound to the un-extended
// base PrismaClient) for code that types its `prisma.$transaction(async (tx)
// => ...)` callback parameter — the retry extension above changes that
// shape, so the stock `Prisma.TransactionClient` no longer matches.
export type PrismaTransactionClient = Omit<typeof prisma, ITXClientDenyList>;
