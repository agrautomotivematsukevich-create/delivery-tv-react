import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TvRotationBar from '../components/TvRotationBar';

// Owner, 16.09.2026: a thin bar on ?tv=1 showing how long until the screen switches;
// no text hints at all.
describe('TvRotationBar', () => {
  it('fills over the rotation period without any text', () => {
    const html = renderToStaticMarkup(<TvRotationBar durationMs={180000} cycle={0} />);

    expect(html).toContain('animation-duration:180000ms');
    expect(html.replace(/<[^>]+>/g, '').trim()).toBe('');
    expect(html).toContain('aria-hidden="true"');
  });

  it('restarts the fill on every screen switch', () => {
    const first = renderToStaticMarkup(<TvRotationBar durationMs={30000} cycle={1} />);
    const second = renderToStaticMarkup(<TvRotationBar durationMs={30000} cycle={2} />);

    expect(first).toContain('data-cycle="1"');
    expect(second).toContain('data-cycle="2"');
  });
});
