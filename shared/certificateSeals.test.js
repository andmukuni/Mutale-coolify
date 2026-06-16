import { describe, expect, it } from 'vitest';
import {
  applyCertificateSeal,
  CERTIFICATE_SEALS,
  getCertificateSeal,
  inferCertificateSealId,
} from './certificateSeals.js';
import { buildDesignFromPreset } from './certificateDesign.js';
import { getCertificateSealSvg } from './certificateSealArt.js';

describe('certificateSeals', () => {
  it('exposes five seal options', () => {
    expect(CERTIFICATE_SEALS).toHaveLength(5);
  });

  it('applies seal element to a design', () => {
    const base = buildDesignFromPreset('attendance', { title: 'Summit' });
    const next = applyCertificateSeal(base, 'gold-round');
    expect(next.sealId).toBe('gold-round');
    expect(next.elements.some((el) => el.id === 'el_seal_logo' && el.seal)).toBe(true);
    expect(next.elements.find((el) => el.id === 'el_seal_logo')?.src).toBe(
      getCertificateSeal('gold-round').src,
    );
  });

  it('infers seal id from existing seal element src', () => {
    const design = applyCertificateSeal(buildDesignFromPreset('achievement', {}), 'navy-star');
    expect(inferCertificateSealId(design)).toBe('navy-star');
  });

  it('generates svg artwork for decorative seals', () => {
    expect(getCertificateSealSvg('gold-round')).toContain('<svg');
    expect(getCertificateSealSvg('classic-wax')).toContain('CERTIFIED');
  });
});
