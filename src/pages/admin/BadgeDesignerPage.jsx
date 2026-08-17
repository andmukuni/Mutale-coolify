import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Eye, Save, CheckCircle2 } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { PageHeader, Card, LoadingButton, Spinner, StatusBadge } from '../../components/ui';
import {
  buildDefaultBadgeDesign,
  validateDesignForPublish,
  createDesignElement,
  buildSamplePreviewData,
  tightenOversizedTextElements,
  upgradeCertificateDesign,
  BADGE_PAPER_SIZE,
} from '../../../shared/certificateDesign.js';
import {
  buildBadgeDesignFromPreset,
  getBadgePreset,
  inferBadgePresetId,
} from '../../../shared/badgePresets.js';
import CertificateCanvas from '../../components/admin/certificate/CertificateCanvas';
import CertificateToolbar from '../../components/admin/certificate/CertificateToolbar';
import CertificateElementPanel from '../../components/admin/certificate/CertificateElementPanel';
import CertificatePreviewModal from '../../components/admin/certificate/CertificatePreviewModal';
import {
  fetchEventBadgeTemplate,
  saveEventBadgeTemplate,
  publishEventBadgeTemplate,
  previewEventBadgeTemplate,
  activateEventBadgeTemplate,
} from '../../utils/badgeApi';

export default function BadgeDesignerPage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { events } = useData();

  const event = events.find((e) => e.id === eventId);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewBlob, setPreviewBlob] = useState(null);

  const [title, setTitle] = useState('Name Badge');
  const [orientation, setOrientation] = useState('portrait');
  const [design, setDesign] = useState(() => buildDefaultBadgeDesign({}));
  const [isActive, setIsActive] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  const selectedElement = useMemo(
    () => design.elements?.find((el) => el.id === selectedId) || null,
    [design.elements, selectedId],
  );

  const loadTemplate = useCallback(async () => {
    setLoading(true);
    try {
      let data = await fetchEventBadgeTemplate(eventId);
      if (!data.configured) {
        data = await activateEventBadgeTemplate(eventId);
      }
      const template = data.template;
      if (!template) throw new Error('Could not load badge template.');

      setTitle(template.title || 'Name Badge');
      setOrientation('portrait');
      const loadedDesign = template.design_json || buildDefaultBadgeDesign(event || {});
      const sampleData = buildSamplePreviewData(event || {}, {
        event_name: event?.title || loadedDesign?.elements?.find((el) => el.key === 'event_name')?.content,
      });
      const upgraded = upgradeCertificateDesign(loadedDesign, event || {});
      const tightened = tightenOversizedTextElements(upgraded, sampleData);
      setDesign({
        ...tightened,
        presetId: inferBadgePresetId(tightened),
        background: tightened.background || loadedDesign.background || { theme: 'badge-ticket' },
      });
      setIsActive(Boolean(template.is_active));
    } catch (error) {
      toast.error(error.message || 'Failed to load badge designer.');
    } finally {
      setLoading(false);
    }
  }, [event, eventId, toast]);

  useEffect(() => {
    void loadTemplate();
  }, [loadTemplate]);

  const backgroundTheme = design?.background?.theme || 'badge-ticket';
  const presetId = inferBadgePresetId(design);
  const samplePreviewData = useMemo(
    () => buildSamplePreviewData(event || {}),
    [event],
  );

  const handlePresetChange = (nextPresetId) => {
    if (nextPresetId === presetId) return;
    const preset = getBadgePreset(nextPresetId);
    const confirmed = window.confirm(
      `Switch to "${preset.name}"? This will replace the current layout with the template defaults.`,
    );
    if (!confirmed) return;
    const nextDesign = tightenOversizedTextElements(
      buildBadgeDesignFromPreset(nextPresetId, event || {}),
      samplePreviewData,
    );
    setDesign(nextDesign);
    setTitle(preset.defaultTitle);
    setSelectedId(null);
  };

  const buildPayload = () => ({
    title,
    orientation: 'portrait',
    paper_size: BADGE_PAPER_SIZE,
    background_image: '',
    design_json: {
      ...design,
      presetId,
      background: { theme: backgroundTheme },
    },
  });

  const handleMoveElement = (id, { x, y }) => {
    setDesign((prev) => ({
      ...prev,
      elements: (prev.elements || []).map((el) => (
        el.id === id ? { ...el, x, y } : el
      )),
    }));
  };

  const handleResizeElement = (id, patch) => {
    setDesign((prev) => ({
      ...prev,
      elements: (prev.elements || []).map((el) => {
        if (el.id !== id) return el;
        const { fontSize, ...geometry } = patch;
        if (fontSize != null) {
          return {
            ...el,
            ...geometry,
            style: { ...(el.style || {}), fontSize },
          };
        }
        return { ...el, ...patch };
      }),
    }));
  };

  const handleDropNewElement = (payload, { x, y }) => {
    const canvas = design.canvas;
    const sampleData = samplePreviewData;
    let element;
    if (payload.elementType === 'text') {
      element = createDesignElement('text', {
        content: payload.content || 'New text',
        x,
        y,
        canvas,
      });
    } else if (payload.elementType === 'placeholder') {
      element = createDesignElement('placeholder', { key: payload.key, x, y, canvas, sampleData });
    } else if (payload.elementType === 'qr') {
      element = createDesignElement('qr', { x, y, canvas });
    } else {
      return;
    }
    handleAddElement(element);
  };

  const handleBackgroundThemeChange = (themeId) => {
    setDesign((prev) => ({
      ...prev,
      background: { theme: themeId },
    }));
  };

  const handleAddElement = (element) => {
    setDesign((prev) => ({
      ...prev,
      elements: [...(prev.elements || []), element],
    }));
    setSelectedId(element.id);
  };

  const handleUpdateElement = (updated) => {
    setDesign((prev) => ({
      ...prev,
      elements: (prev.elements || []).map((el) => (el.id === updated.id ? updated : el)),
    }));
  };

  const handleDeleteElement = (id) => {
    setDesign((prev) => ({
      ...prev,
      elements: (prev.elements || []).filter((el) => el.id !== id),
    }));
    if (selectedId === id) setSelectedId(null);
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      const saved = await saveEventBadgeTemplate(eventId, buildPayload());
      setDesign({
        ...(saved.design_json || design),
        background: saved.design_json?.background || { theme: backgroundTheme },
      });
      setIsActive(Boolean(saved.is_active));
      toast.success('Draft saved.');
    } catch (error) {
      toast.error(error.message || 'Failed to save draft.');
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    setPreviewing(true);
    try {
      const blob = await previewEventBadgeTemplate(eventId, buildPayload());
      const url = URL.createObjectURL(blob);
      setPreviewBlob(blob);
      setPreviewUrl(url);
    } catch (error) {
      toast.error(error.message || 'Preview failed.');
    } finally {
      setPreviewing(false);
    }
  };

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl('');
    setPreviewBlob(null);
  };

  const handleDownloadPreview = () => {
    if (!previewBlob) return;
    const url = URL.createObjectURL(previewBlob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `Badges-A4-${eventId}.pdf`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handlePublish = async () => {
    const validation = validateDesignForPublish(design, { title });
    if (!validation.ok) {
      toast.error(validation.errors[0] || 'Design is incomplete.');
      return;
    }

    setPublishing(true);
    try {
      const saved = await publishEventBadgeTemplate(eventId, buildPayload());
      setIsActive(Boolean(saved.is_active));
      toast.success('Badge template published and activated.');
    } catch (error) {
      toast.error(error.message || 'Publish failed.');
    } finally {
      setPublishing(false);
    }
  };

  if (!event && !loading) {
    return (
      <div className="text-center py-20 text-navy-500">
        <p>Event not found.</p>
        <Link to="/admin/events" className="text-cyan-600 hover:underline text-sm mt-2 inline-block">
          ← Back to Events
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Badge Designer"
        subtitle={`6×8 inch name badges for this event · prints 2 per A4 · ${event?.title || 'Loading event…'}`}
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'Events', to: '/admin/events' },
          { label: 'Event Profile', to: `/admin/events/${eventId}` },
          { label: 'Badge Designer' },
        ]}
        actions={(
          <>
            <button
              type="button"
              onClick={() => navigate(`/admin/events/${eventId}`)}
              className="inline-flex items-center gap-2 text-sm font-medium bg-white border border-navy-200 text-navy-700 px-4 py-2 rounded-xl"
            >
              <ArrowLeft size={15} />
              Back to Event
            </button>
            <LoadingButton
              onClick={handleSaveDraft}
              loading={saving}
              loadingLabel="Saving…"
              className="inline-flex items-center gap-2 text-sm font-medium bg-white border border-navy-200 text-navy-700 px-4 py-2 rounded-xl"
            >
              <Save size={15} />
              Save Draft
            </LoadingButton>
            <LoadingButton
              onClick={handlePreview}
              loading={previewing}
              loadingLabel="Generating…"
              className="inline-flex items-center gap-2 text-sm font-medium bg-white border border-cyan-200 text-cyan-700 px-4 py-2 rounded-xl"
            >
              <Eye size={15} />
              Preview A4
            </LoadingButton>
            <LoadingButton
              onClick={handlePublish}
              loading={publishing}
              loadingLabel="Publishing…"
              className="inline-flex items-center gap-2 text-sm font-medium bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-xl"
            >
              <CheckCircle2 size={15} />
              Publish / Activate
            </LoadingButton>
          </>
        )}
      />

      <div className="flex items-center gap-3">
        <StatusBadge status={isActive ? 'published' : 'draft'} />
        <span className="text-sm text-navy-500">
          {isActive ? 'Template is active — print 2 badges per A4 sheet.' : 'Draft mode — publish to enable batch printing (2 per A4).'}
        </span>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center"><Spinner /></div>
      ) : (
        <div className="grid xl:grid-cols-[280px_1fr_300px] gap-6">
          <Card title="Tools" subtitle="Pick a background and drag fields onto the 6×8 badge">
            <CertificateToolbar
              mode="badge"
              presetId={presetId}
              onPresetChange={handlePresetChange}
              onAddElement={handleAddElement}
              backgroundTheme={backgroundTheme}
              onBackgroundThemeChange={handleBackgroundThemeChange}
              orientation={orientation}
              canvas={design.canvas}
              sampleData={samplePreviewData}
            />
            <label className="block text-sm mt-4">
              <span className="text-xs text-navy-500">Badge title</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-navy-200 text-sm"
              />
            </label>
          </Card>

          <Card title="Design canvas" subtitle="6×8 inch canvas · drag to move · pull handles to resize">
            <CertificateCanvas
              design={design}
              backgroundTheme={backgroundTheme}
              orientation={orientation}
              selectedId={selectedId}
              onSelectElement={setSelectedId}
              onMoveElement={handleMoveElement}
              onResizeElement={handleResizeElement}
              onDropNewElement={handleDropNewElement}
              sampleData={samplePreviewData}
            />
          </Card>

          <Card title="Properties" subtitle="Selected element">
            <CertificateElementPanel
              element={selectedElement}
              canvas={design.canvas}
              sampleData={samplePreviewData}
              onChange={handleUpdateElement}
              onDelete={handleDeleteElement}
            />
          </Card>
        </div>
      )}

      {previewUrl && (
        <CertificatePreviewModal
          title="A4 preview — 2 badges per sheet"
          pdfUrl={previewUrl}
          onClose={closePreview}
          onDownload={handleDownloadPreview}
        />
      )}
    </div>
  );
}
