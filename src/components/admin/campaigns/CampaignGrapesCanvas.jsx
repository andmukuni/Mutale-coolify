import { useCallback, useEffect, useRef } from 'react';
import grapesjs from 'grapesjs';
import 'grapesjs/dist/css/grapes.min.css';
import { designToGrapesComponents, grapesCampaignPlugin, grapesToBlocks } from './grapesCampaignPlugin.js';

export default function CampaignGrapesCanvas({ design, onChange, readOnly = false }) {
  const rootRef = useRef(null);
  const editorRef = useRef(null);
  const skipRef = useRef(false);

  const emit = useCallback(() => {
    const editor = editorRef.current;
    if (!editor || skipRef.current) return;
    const grapes = editor.getProjectData();
    const blocks = grapesToBlocks(editor);
    onChange?.({
      version: 1,
      grapes,
      blocks: blocks.length ? blocks : design?.blocks || [],
    });
  }, [design?.blocks, onChange]);

  useEffect(() => {
    if (!rootRef.current || editorRef.current) return undefined;
    const editor = grapesjs.init({
      container: rootRef.current,
      height: '520px',
      storageManager: false,
      fromElement: false,
      noticeOnUnload: false,
      canvas: {
        styles: [],
      },
      plugins: [grapesCampaignPlugin],
      deviceManager: {
        devices: [
          { name: 'Desktop', width: '' },
          { name: 'Mobile', width: '375px', widthMedia: '480px' },
        ],
      },
    });
    editorRef.current = editor;
    if (readOnly) editor.setDragMode('');
    const html = design?.grapes
      ? null
      : designToGrapesComponents(design);
    if (design?.grapes) {
      skipRef.current = true;
      editor.loadProjectData(design.grapes);
      skipRef.current = false;
    } else {
      editor.setComponents(html || '<div></div>');
    }
    editor.on('update', emit);
    return () => {
      editor.off('update', emit);
      editor.destroy();
      editorRef.current = null;
    };
    // Initialize once per mount. Design is loaded from the initial props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly]);

  return (
    <div className="rounded-xl border border-navy-100 overflow-hidden bg-white">
      <div ref={rootRef} className="gjs-campaign-editor min-h-[520px]" />
    </div>
  );
}
