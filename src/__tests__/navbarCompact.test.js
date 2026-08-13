import { describe, expect, it } from 'vitest';
import { nextHeaderCompactState } from '../components/Navbar';

describe('nextHeaderCompactState', () => {
  it('does not compact at the old 24px threshold', () => {
    expect(nextHeaderCompactState(false, 24, 120)).toBe(false);
    expect(nextHeaderCompactState(false, 80, 120)).toBe(false);
  });

  it('compacts only after scrolling past the header height', () => {
    expect(nextHeaderCompactState(false, 169, 120)).toBe(true);
  });

  it('stays compact until the page is almost back at the top', () => {
    expect(nextHeaderCompactState(true, 40, 120)).toBe(true);
    expect(nextHeaderCompactState(true, 8, 120)).toBe(false);
  });
});
