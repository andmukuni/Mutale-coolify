import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

describe('theme setup', () => {
  it('registers dark variant and app tokens in global css', () => {
    const css = readFileSync(path.join(process.cwd(), 'src/index.css'), 'utf8');
    expect(css).toContain('@custom-variant dark');
    expect(css).toContain('--app-bg');
    expect(css).toContain('.dark .bg-white');
  });

  it('includes pre-hydration theme script in index.html', () => {
    const html = readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
    expect(html).toContain('mm_color_scheme');
    expect(html).toContain('classList.add(\'dark\')');
  });
});
