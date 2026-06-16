import { forwardRef } from 'react';
import { renderReceiptDocumentHtml } from './receiptDocumentHtml.js';

const ReceiptDocument = forwardRef(function ReceiptDocument(
  { viewModel, outerPadding = true },
  ref,
) {
  const html = renderReceiptDocumentHtml(viewModel, { outerPadding });
  return (
    <div
      ref={ref}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});

export default ReceiptDocument;
