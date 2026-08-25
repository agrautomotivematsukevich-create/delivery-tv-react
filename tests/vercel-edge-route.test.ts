import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Vercel edge route', () => {
  it('proxies edge requests before the SPA fallback', () => {
    const config = JSON.parse(fs.readFileSync(path.resolve('vercel.json'), 'utf8')) as {
      rewrites?: Array<{ source?: string; destination?: string }>;
    };

    expect(config.rewrites?.[0]).toEqual({
      source: '/edge/:path*',
      destination: 'https://staff24-server.tail77821b.ts.net/:path*',
    });
  });
});
