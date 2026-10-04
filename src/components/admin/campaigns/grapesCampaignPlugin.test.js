import { describe, expect, it } from 'vitest';
import { GROWING_PEOPLE_BLOCK_TYPES } from '../../../../shared/emailDesignCompile.js';
import { designToGrapesComponents } from './grapesCampaignPlugin.js';

describe('GrapesJS Growing People plugin helpers', () => {
  it('renders every Growing People block type into the canvas HTML', () => {
    const html = designToGrapesComponents({
      blocks: GROWING_PEOPLE_BLOCK_TYPES.map((item) => ({ type: item.type })),
    });
    for (const item of GROWING_PEOPLE_BLOCK_TYPES) {
      expect(html).toContain(`data-mm-type="${item.type}"`);
    }
  });
});
