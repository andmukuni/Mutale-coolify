/**
 * Trigger a file download from a Blob. Uses anchor click first, then a hidden iframe fallback
 * when the browser blocks programmatic downloads after async work.
 * @param {Blob} blob
 * @param {string} filename
 */
export function downloadBlob(blob, filename) {
  if (!blob || blob.size < 500) {
    throw new Error('Cannot download an empty or invalid PDF.');
  }

  const url = URL.createObjectURL(blob);
  const cleanup = () => {
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Some browsers ignore async-triggered anchor downloads; iframe load often still saves/opens the file.
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden;';
  iframe.setAttribute('aria-hidden', 'true');
  iframe.src = url;
  document.body.appendChild(iframe);
  setTimeout(() => {
    iframe.remove();
    cleanup();
  }, 8000);
}

/**
 * @deprecated Receipt downloads use downloadBlob — showSaveFilePicker creates 0-byte files on macOS.
 * @param {string} filename
 * @returns {Promise<FileSystemFileHandle | null>}
 */
export async function pickPdfSaveFile(filename) {
  void filename;
  return null;
}

/**
 * @param {FileSystemFileHandle} handle
 * @param {Uint8Array | ArrayBuffer} bytes
 */
export async function writeBytesToFileHandle(handle, bytes) {
  const payload = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (!payload.byteLength || payload.byteLength < 500) {
    throw new Error('Cannot save an empty or invalid PDF.');
  }
  const writable = await handle.createWritable();
  try {
    await writable.write(payload);
  } finally {
    await writable.close();
  }
}
