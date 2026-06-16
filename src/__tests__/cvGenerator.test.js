import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  openCvForPrint,
  openHtmlForPrint,
  openHtmlForPrintInPopup,
} from '../utils/cvGenerator.js';

vi.mock('../../shared/cvDocumentHtml.js', () => ({
  renderCvDocumentHtml: vi.fn(() => '<!DOCTYPE html><html><body><h1>Test CV</h1></body></html>'),
}));

const SAMPLE_HTML = '<!DOCTYPE html><html><body><h1>Jane Doe CV</h1></body></html>';

function triggerIframeLoad() {
  const iframe = document.querySelector('iframe[title="CV print"]');
  if (iframe?.onload) {
    iframe.onload(new Event('load'));
  }
}

describe('openHtmlForPrint', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('throws when html is empty', () => {
    expect(() => openHtmlForPrint('')).toThrow(/could not generate/i);
    expect(() => openHtmlForPrint('   ')).toThrow(/could not generate/i);
  });

  it('appends iframe, sets srcdoc, and triggers print', () => {
    const printFn = vi.fn();
    const focusFn = vi.fn();
    const originalCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag, options) => {
      const el = originalCreate(tag, options);
      if (tag === 'iframe') {
        Object.defineProperty(el, 'contentWindow', {
          configurable: true,
          value: { focus: focusFn, print: printFn },
        });
      }
      return el;
    });

    openHtmlForPrint(SAMPLE_HTML);

    const iframe = document.querySelector('iframe[title="CV print"]');
    expect(iframe).toBeTruthy();
    expect(iframe?.srcdoc).toContain('Jane Doe CV');

    triggerIframeLoad();
    vi.advanceTimersByTime(400);
    expect(focusFn).toHaveBeenCalled();
    expect(printFn).toHaveBeenCalled();
  });

  it('falls back to popup when iframe has no print()', () => {
    const originalCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag, options) => {
      const el = originalCreate(tag, options);
      if (tag === 'iframe') {
        Object.defineProperty(el, 'contentWindow', {
          configurable: true,
          value: { focus: vi.fn() },
        });
      }
      return el;
    });

    const printFn = vi.fn();
    const popup = {
      document: {
        open: vi.fn(),
        write: vi.fn(),
        close: vi.fn(),
        readyState: 'complete',
      },
      focus: vi.fn(),
      print: printFn,
      addEventListener: vi.fn(),
    };
    vi.spyOn(window, 'open').mockReturnValue(popup);

    openHtmlForPrint(SAMPLE_HTML);
    triggerIframeLoad();
    vi.advanceTimersByTime(800);

    expect(popup.document.write).toHaveBeenCalledWith(SAMPLE_HTML);
    expect(printFn).toHaveBeenCalled();
  });
});

describe('openHtmlForPrintInPopup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('throws when pop-up is blocked', () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    expect(() => openHtmlForPrintInPopup(SAMPLE_HTML)).toThrow(/pop-up blocked/i);
  });

  it('writes html and schedules print', () => {
    const printFn = vi.fn();
    const popup = {
      document: {
        open: vi.fn(),
        write: vi.fn(),
        close: vi.fn(),
        readyState: 'complete',
      },
      focus: vi.fn(),
      print: printFn,
      addEventListener: vi.fn(),
    };
    vi.spyOn(window, 'open').mockReturnValue(popup);

    openHtmlForPrintInPopup(SAMPLE_HTML);
    expect(popup.document.write).toHaveBeenCalledWith(SAMPLE_HTML);
    vi.advanceTimersByTime(400);
    expect(printFn).toHaveBeenCalled();
  });
});

describe('openCvForPrint', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('renders document html and opens print view', async () => {
    const { renderCvDocumentHtml } = await import('../../shared/cvDocumentHtml.js');
    const printFn = vi.fn();
    const originalCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag, options) => {
      const el = originalCreate(tag, options);
      if (tag === 'iframe') {
        Object.defineProperty(el, 'contentWindow', {
          configurable: true,
          value: { focus: vi.fn(), print: printFn },
        });
      }
      return el;
    });

    openCvForPrint({
      user: { name: 'Jane Doe' },
      certificates: [],
      developmentEvents: [],
      templateId: 'classic',
    });

    expect(renderCvDocumentHtml).toHaveBeenCalledWith(
      expect.objectContaining({ user: { name: 'Jane Doe' }, templateId: 'classic' }),
    );

    triggerIframeLoad();
    vi.advanceTimersByTime(400);
    expect(printFn).toHaveBeenCalled();
  });

  it('uses prebuilt html without calling renderCvDocumentHtml', async () => {
    const { renderCvDocumentHtml } = await import('../../shared/cvDocumentHtml.js');
    vi.mocked(renderCvDocumentHtml).mockClear();
    const printFn = vi.fn();
    const originalCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag, options) => {
      const el = originalCreate(tag, options);
      if (tag === 'iframe') {
        Object.defineProperty(el, 'contentWindow', {
          configurable: true,
          value: { focus: vi.fn(), print: printFn },
        });
      }
      return el;
    });

    const html = '<!DOCTYPE html><html><body>Cached</body></html>';
    openCvForPrint({ user: { name: 'Jane' }, html });

    expect(renderCvDocumentHtml).not.toHaveBeenCalled();
    triggerIframeLoad();
    vi.advanceTimersByTime(400);
    expect(printFn).toHaveBeenCalled();
  });
});
