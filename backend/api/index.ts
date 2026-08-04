import { createApp } from '../src/app';

// Vercel's Node.js runtime accepts a default-exported Express app directly —
// an Express app is itself a callable (req, res) request handler, so no
// serverless-http (or similar TCP-server wrapper) is needed. See Vercel's
// "Express on Vercel" docs. vercel.json rewrites every incoming path to
// this function.
//
// createApp() runs once per cold start (module-level, not per-request), so
// the src/db/client.ts Prisma singleton it wires up is created once and
// reused for every request this warm function instance handles — see
// README "Deploying to Vercel".
export default createApp();
