import { defineConfig } from 'vitest/config';

// Separate config so the (slow) table generator never runs as part of `npm test`.
export default defineConfig({ test: { include: ['src/world/genVariants.script.ts'] } });
