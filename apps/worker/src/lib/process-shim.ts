import { Buffer } from "buffer";

// Provide a minimal Node.js process shim for libraries that expect process.env.
// This runs before other imports to avoid "process is not defined" errors in Workers.
const g: any = globalThis as any;
if (!g.process) {
  g.process = { env: {} };
} else if (!g.process.env) {
  g.process.env = {};
}

// NodeRSA bundle uses its own Buffer polyfill; mark native Buffer instances as buffers too.
g.Buffer = g.Buffer ?? Buffer;
if (g.Buffer && !g.Buffer.prototype._isBuffer) {
  g.Buffer.prototype._isBuffer = true;
}
