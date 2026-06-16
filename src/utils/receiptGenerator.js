export {
  generateReceipt,
  downloadReceiptFromViewModel,
  downloadReceiptPreviewPdf,
} from './receiptPdfClient.js';

export { downloadReceiptPdf, resolveReceiptSource } from './receiptPdfDownload.js';

export { isReceiptEligible, formatReceiptDisplayNumber } from '../../shared/receiptNumbers.js';
export {
  resolveReceiptType,
  getReceiptSubjectTitle,
  buildReceiptDetailRows,
  getReceiptLineItemDescription,
  mapRegistrationToReceiptRecord,
  mapBookOrderToReceiptRecord,
  mapCvPaymentToReceiptRecord,
  mergeReceiptRecords,
} from '../../shared/receiptHelpers.js';
export { RECEIPT_PALETTE, RECEIPT_LIGHT_FILL, RECEIPT_LIGHT_BOX, RECEIPT_BORDER } from '../../shared/receiptTheme.js';
