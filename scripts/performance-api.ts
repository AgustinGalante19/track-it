// This entry point is used only by the fictional browser harness.
export {};
if (process.env.DATABASE_URL !== 'file:.data/performance-test.db' || process.env.PORT !== '3002'
    || process.env.NODE_ENV !== 'development') throw new Error('Invalid performance harness environment');
const { serve } = await import('@hono/node-server');
const { app } = await import('../server/app');
const { migrateDatabase } = await import('../server/migrate');
const { db } = await import('../server/db/client');
const { rateLimit } = await import('../server/db/schema');
await migrateDatabase();
let responseDelay = 0;
serve({ hostname: '127.0.0.1', port: 3002, fetch: async (request) => {
  const path = new URL(request.url).pathname;
  if (path === '/api/__pcache/reset-rate-limit' && request.method === 'POST') {
    // Each fictional fixture represents an independent browser/user. Never exposed by the normal API.
    await db.delete(rateLimit);
    return Response.json({ ok: true });
  }
  if (path === '/api/__pcache/delay' && request.method === 'POST') {
    const { delay } = await request.json() as { delay: number };
    if (delay !== 0 && delay !== 400) return new Response(null, { status: 400 });
    responseDelay = delay;
    return Response.json({ ok: true });
  }
  const response = await app.fetch(request);
  if (responseDelay && (path === '/api/bootstrap' || (request.method !== 'GET' && !path.startsWith('/api/auth/')))) {
    await new Promise((resolve) => setTimeout(resolve, responseDelay));
  }
  return response;
} });
