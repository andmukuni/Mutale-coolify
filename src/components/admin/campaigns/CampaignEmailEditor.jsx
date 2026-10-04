import { lazy, Suspense, useMemo, useState } from 'react';
import { CAMPAIGN_MERGE_TAGS } from '../../../../shared/emailCampaign.js';
import { GROWING_PEOPLE_BLOCK_TYPES, compileDesignToHtml, normalizeDesignDocument } from '../../../../shared/emailDesignCompile.js';

const CampaignGrapesCanvas = lazy(() => import('./CampaignGrapesCanvas.jsx'));

function newBlock(type) {
  return {
    id: `blk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    text: type === 'heading' ? '{{event_title}}' : (type === 'text' ? 'Hi {{first_name}},' : ''),
    label: type === 'button' ? 'Open' : '',
    url: type === 'button' || type === 'resource_card' ? '{{resource_page_url}}' : '',
    src: '',
    alt: '',
    resource_title: type === 'resource_card' ? 'Event resource' : '',
    resource_description: '',
    columns: ['', ''],
  };
}

export default function CampaignEmailEditor({
  design,
  subject = '',
  preheader = '',
  onChange,
  mergeTags = CAMPAIGN_MERGE_TAGS,
  readOnly = false,
}) {
  const [mode, setMode] = useState('visual');
  const [previewMode, setPreviewMode] = useState('desktop');
  const doc = useMemo(() => normalizeDesignDocument(design), [design]);
  const html = useMemo(
    () => compileDesignToHtml(doc, {
      first_name: 'there',
      full_name: 'Guest',
      event_title: 'Demo event',
      event_when: '1 May 2027 09:00',
      venue_or_join: 'Lusaka / online',
      registration_ref: 'MM-TEST-0001',
      resource_page_url: 'https://mutalemubanga.org/resources/demo',
      preferences_url: 'https://mutalemubanga.org/email/preferences',
      unsubscribe_url: 'https://mutalemubanga.org/email/unsubscribe',
    }, { title: subject, previewText: preheader }),
    [doc, preheader, subject],
  );

  const updateBlocks = (blocks) => onChange?.({ ...doc, blocks });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-xl border border-navy-200 overflow-hidden text-sm">
          <button type="button" className={`px-3 py-1.5 ${mode === 'visual' ? 'bg-cyan-50 text-cyan-800' : 'text-navy-600'}`} onClick={() => setMode('visual')}>Visual</button>
          <button type="button" className={`px-3 py-1.5 ${mode === 'blocks' ? 'bg-cyan-50 text-cyan-800' : 'text-navy-600'}`} onClick={() => setMode('blocks')}>Blocks</button>
          <button type="button" className={`px-3 py-1.5 ${mode === 'preview' ? 'bg-cyan-50 text-cyan-800' : 'text-navy-600'}`} onClick={() => setMode('preview')}>Preview</button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {mergeTags.map((tag) => (
            <span key={tag.key} className="text-[11px] px-2 py-1 rounded-full bg-navy-50 text-navy-600 font-mono">{`{{${tag.key}}}`}</span>
          ))}
        </div>
      </div>

      {mode === 'visual' && (
        <Suspense fallback={<p className="text-sm text-navy-500">Loading GrapesJS editor…</p>}>
          <CampaignGrapesCanvas design={doc} onChange={onChange} readOnly={readOnly} />
        </Suspense>
      )}

      {mode === 'blocks' && (
        <div className="space-y-3">
          {!readOnly && (
            <div className="flex flex-wrap gap-2">
              {GROWING_PEOPLE_BLOCK_TYPES.map((item) => (
                <button
                  key={item.type}
                  type="button"
                  onClick={() => updateBlocks([...doc.blocks, newBlock(item.type)])}
                  className="text-xs px-2.5 py-1.5 rounded-lg border border-navy-200 text-navy-700 hover:bg-navy-50"
                >
                  + {item.label}
                </button>
              ))}
            </div>
          )}
          {doc.blocks.map((block, index) => (
            <div key={block.id || index} className="rounded-xl border border-navy-100 p-3 space-y-2 bg-white">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-navy-400">{block.type}</p>
                {!readOnly && (
                  <button type="button" className="text-xs text-red-600" onClick={() => updateBlocks(doc.blocks.filter((_, i) => i !== index))}>Remove</button>
                )}
              </div>
              {['heading', 'text'].includes(block.type) && (
                <textarea
                  disabled={readOnly}
                  className="w-full rounded-lg border border-navy-200 px-3 py-2 text-sm"
                  rows={block.type === 'text' ? 4 : 2}
                  value={block.text || ''}
                  onChange={(e) => updateBlocks(doc.blocks.map((item, i) => (i === index ? { ...item, text: e.target.value } : item)))}
                />
              )}
              {block.type === 'button' && (
                <div className="grid sm:grid-cols-2 gap-2">
                  <input disabled={readOnly} className="rounded-lg border border-navy-200 px-3 py-2 text-sm" value={block.label || ''} placeholder="Label" onChange={(e) => updateBlocks(doc.blocks.map((item, i) => (i === index ? { ...item, label: e.target.value } : item)))} />
                  <input disabled={readOnly} className="rounded-lg border border-navy-200 px-3 py-2 text-sm" value={block.url || ''} placeholder="https:// or {{merge}}" onChange={(e) => updateBlocks(doc.blocks.map((item, i) => (i === index ? { ...item, url: e.target.value } : item)))} />
                </div>
              )}
              {block.type === 'image' && (
                <div className="grid sm:grid-cols-2 gap-2">
                  <input disabled={readOnly} className="rounded-lg border border-navy-200 px-3 py-2 text-sm" value={block.src || ''} placeholder="https image URL" onChange={(e) => updateBlocks(doc.blocks.map((item, i) => (i === index ? { ...item, src: e.target.value } : item)))} />
                  <input disabled={readOnly} className="rounded-lg border border-navy-200 px-3 py-2 text-sm" value={block.alt || ''} placeholder="Alt text" onChange={(e) => updateBlocks(doc.blocks.map((item, i) => (i === index ? { ...item, alt: e.target.value } : item)))} />
                </div>
              )}
              {block.type === 'resource_card' && (
                <div className="grid gap-2">
                  <input disabled={readOnly} className="rounded-lg border border-navy-200 px-3 py-2 text-sm" value={block.resource_title || ''} placeholder="Resource title" onChange={(e) => updateBlocks(doc.blocks.map((item, i) => (i === index ? { ...item, resource_title: e.target.value } : item)))} />
                  <input disabled={readOnly} className="rounded-lg border border-navy-200 px-3 py-2 text-sm" value={block.resource_description || ''} placeholder="Description" onChange={(e) => updateBlocks(doc.blocks.map((item, i) => (i === index ? { ...item, resource_description: e.target.value } : item)))} />
                  <input disabled={readOnly} className="rounded-lg border border-navy-200 px-3 py-2 text-sm" value={block.resource_id || ''} placeholder="Resource id (optional)" onChange={(e) => updateBlocks(doc.blocks.map((item, i) => (i === index ? { ...item, resource_id: e.target.value } : item)))} />
                  <input disabled={readOnly} className="rounded-lg border border-navy-200 px-3 py-2 text-sm" value={block.url || ''} placeholder="{{resource_page_url}}" onChange={(e) => updateBlocks(doc.blocks.map((item, i) => (i === index ? { ...item, url: e.target.value } : item)))} />
                </div>
              )}
              {block.type === 'columns' && (
                <div className="grid sm:grid-cols-2 gap-2">
                  {(block.columns || ['', '']).slice(0, 2).map((col, colIndex) => (
                    <textarea
                      key={colIndex}
                      disabled={readOnly}
                      className="w-full rounded-lg border border-navy-200 px-3 py-2 text-sm"
                      rows={3}
                      value={col}
                      onChange={(e) => {
                        const columns = [...(block.columns || ['', ''])];
                        columns[colIndex] = e.target.value;
                        updateBlocks(doc.blocks.map((item, i) => (i === index ? { ...item, columns } : item)));
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {mode === 'preview' && (
        <div className="space-y-3">
          <div className="inline-flex rounded-xl border border-navy-200 overflow-hidden text-sm">
            <button type="button" className={`px-3 py-1.5 ${previewMode === 'desktop' ? 'bg-cyan-50 text-cyan-800' : 'text-navy-600'}`} onClick={() => setPreviewMode('desktop')}>Desktop</button>
            <button type="button" className={`px-3 py-1.5 ${previewMode === 'mobile' ? 'bg-cyan-50 text-cyan-800' : 'text-navy-600'}`} onClick={() => setPreviewMode('mobile')}>Mobile</button>
          </div>
          <iframe
            title="Email preview"
            className={`bg-navy-50 rounded-xl border border-navy-100 ${previewMode === 'mobile' ? 'w-[375px] max-w-full h-[640px]' : 'w-full h-[640px]'}`}
            srcDoc={html}
          />
          <p className="text-xs text-navy-400">Inbox proof in Gmail, Outlook, and Apple Mail is a manual checklist, not an automated test.</p>
        </div>
      )}
    </div>
  );
}
