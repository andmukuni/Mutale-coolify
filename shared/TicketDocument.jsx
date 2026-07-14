import { forwardRef } from 'react';
import { renderTicketDocumentHtml } from './ticketDocumentHtml.js';

const TicketDocument = forwardRef(function TicketDocument(
  { viewModel, outerPadding = true },
  ref,
) {
  const html = renderTicketDocumentHtml(viewModel, { outerPadding });
  return (
    <div
      ref={ref}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});

export default TicketDocument;
