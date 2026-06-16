import { describe, it, expect } from 'vitest';
import { buildCvDocxBlob, buildCvDocxBlobWithFilename } from './cvDocx.js';

describe('buildCvDocxBlob', () => {
  it('returns a non-empty docx blob for a minimal user', async () => {
    const blob = await buildCvDocxBlob({
      user: { name: 'Jane Doe', email: 'jane@example.com', profession: 'Analyst' },
      certificates: [],
      developmentEvents: [],
    });
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(1000);
    expect(blob.type).toContain('officedocument');
  });

  it('includes certificate and event sections when provided', async () => {
    const { blob, filename } = await buildCvDocxBlobWithFilename({
      user: { name: 'John Smith' },
      certificates: [{ event_title: 'Lab QA', issued_at: '2026-01-15', certificate_code: 'CERT-1' }],
      developmentEvents: [{ event_title: 'Workshop', registered_at: '2025-06-01', status: 'attended' }],
    });
    expect(blob.size).toBeGreaterThan(1500);
    expect(filename).toMatch(/John-Smith-CV\.docx$/);
  });
});
