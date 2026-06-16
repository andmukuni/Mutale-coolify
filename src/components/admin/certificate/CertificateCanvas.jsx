import { useEffect, useRef, useState } from 'react';
import { Move } from 'lucide-react';
import { PLACEHOLDER_LABELS, resolveCertificateFont } from '../../../../shared/certificateDesign.js';
import { DEFAULT_BACKGROUND_THEME } from '../../../../shared/certificateBackgrounds.js';
import CertificateBackgroundLayer from './CertificateBackgroundLayer.jsx';
import CertificateTransformHandles from './CertificateTransformHandles.jsx';
import { resolveCertificateImageSrc } from '../../../utils/certificateImage.js';
import {
  boxElementStyle,
  elementToBounds,
  computeResizePatch,
  fontSizePtToPreviewPx,
} from '../../../../shared/certificateTransform.js';

const SAMPLE_VALUES = {
  attendee_name: 'Jane M. Sample',
  event_name: 'Sample Event',
  event_date: '1 June 2026',
  certificate_number: 'MM-CERT-SAMPLE01',
  issue_date: '3 June 2026',
};

function resolveElementText(element, sampleData = null) {
  if (element.type === 'placeholder') {
    const key = element.key || 'attendee_name';
    if (sampleData?.[key]) return sampleData[key];
    return SAMPLE_VALUES[key] || PLACEHOLDER_LABELS[key] || `{{${key}}}`;
  }
  return element.content || '';
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clientToNormalized(clientX, clientY, rect) {
  const x = clamp((clientX - rect.left) / rect.width, 0.02, 0.98);
  const y = clamp((clientY - rect.top) / rect.height, 0.02, 0.98);
  return { x, y };
}

export default function CertificateCanvas({
  design,
  backgroundTheme,
  orientation,
  selectedId,
  onSelectElement,
  onMoveElement,
  onResizeElement,
  onDropNewElement,
  readOnly = false,
  hideChrome = false,
  sampleData = null,
  fullWidth = false,
}) {
  const canvasRef = useRef(null);
  const interactionRef = useRef(null);
  const resizeListenersRef = useRef(null);
  const [activeInteraction, setActiveInteraction] = useState(null);
  const [dropHint, setDropHint] = useState(false);
  const [canvasPxHeight, setCanvasPxHeight] = useState(400);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return undefined;
    const update = () => {
      setCanvasPxHeight(el.getBoundingClientRect().height || 400);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => () => {
    if (resizeListenersRef.current) {
      window.removeEventListener('pointermove', resizeListenersRef.current.onMove);
      window.removeEventListener('pointerup', resizeListenersRef.current.onUp);
      window.removeEventListener('pointercancel', resizeListenersRef.current.onUp);
    }
  }, []);

  const canvas = design?.canvas || { widthMm: 297, heightMm: 210 };
  const aspectRatio = canvas.widthMm / canvas.heightMm;
  const elements = Array.isArray(design?.elements) ? design.elements : [];
  const theme = backgroundTheme || design?.background?.theme || DEFAULT_BACKGROUND_THEME;

  const endInteraction = (e) => {
    if (e?.currentTarget?.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    interactionRef.current = null;
    setActiveInteraction(null);
  };

  const handleCanvasPointerDown = (e) => {
    if (e.target === e.currentTarget) {
      onSelectElement?.(null);
    }
  };

  const startMove = (e, element) => {
    e.stopPropagation();
    e.preventDefault();
    onSelectElement?.(element.id);
    interactionRef.current = {
      mode: 'move',
      elementId: element.id,
      pointerId: e.pointerId,
    };
    setActiveInteraction({ mode: 'move', elementId: element.id });
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleMovePointerMove = (e, elementId) => {
    const state = interactionRef.current;
    if (!state || state.mode !== 'move' || state.elementId !== elementId) return;
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    if (!canvasRef.current || !onMoveElement) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const { x, y } = clientToNormalized(e.clientX, e.clientY, rect);
    onMoveElement(elementId, { x, y });
  };

  const applyResizeAtPointer = (clientX, clientY) => {
    const state = interactionRef.current;
    if (!state || state.mode !== 'resize' || !canvasRef.current || !onResizeElement) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const pointer = clientToNormalized(clientX, clientY, rect);
    const scaleFont = state.elementType === 'text' || state.elementType === 'placeholder';
    const patch = computeResizePatch(state.startBounds, state.handle, pointer, {
      scaleFont,
      startFontSize: state.startFontSize,
    });
    onResizeElement(state.elementId, patch);
  };

  const stopResizeListeners = () => {
    if (!resizeListenersRef.current) return;
    window.removeEventListener('pointermove', resizeListenersRef.current.onMove);
    window.removeEventListener('pointerup', resizeListenersRef.current.onUp);
    window.removeEventListener('pointercancel', resizeListenersRef.current.onUp);
    resizeListenersRef.current = null;
  };

  const startResize = (e, element, handleId) => {
    e.stopPropagation();
    e.preventDefault();
    onSelectElement?.(element.id);
    stopResizeListeners();

    const startBounds = elementToBounds(element);
    const pointerId = e.pointerId;
    interactionRef.current = {
      mode: 'resize',
      elementId: element.id,
      elementType: element.type,
      handle: handleId,
      startBounds,
      startFontSize: Number(element.style?.fontSize) || 14,
      pointerId,
    };
    setActiveInteraction({ mode: 'resize', elementId: element.id, handle: handleId });

    const onMove = (ev) => {
      if (ev.pointerId !== pointerId) return;
      ev.preventDefault();
      applyResizeAtPointer(ev.clientX, ev.clientY);
    };
    const onUp = (ev) => {
      if (ev.pointerId !== pointerId) return;
      stopResizeListeners();
      endInteraction(ev);
    };

    resizeListenersRef.current = { onMove, onUp };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const handleDragOver = (e) => {
    if (e.dataTransfer.types.includes('application/x-cert-element')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setDropHint(true);
    }
  };

  const handleDragLeave = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDropHint(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDropHint(false);
    const raw = e.dataTransfer.getData('application/x-cert-element');
    if (!raw || !canvasRef.current || !onDropNewElement) return;
    try {
      const payload = JSON.parse(raw);
      const rect = canvasRef.current.getBoundingClientRect();
      const { x, y } = clientToNormalized(e.clientX, e.clientY, rect);
      onDropNewElement(payload, { x, y });
    } catch {
      // ignore invalid payload
    }
  };

  const renderElement = (element) => {
    const isSelected = selectedId === element.id;
    const isActive = activeInteraction?.elementId === element.id;
    const style = element.style || {};
    const box = boxElementStyle(element);

    const wrapperClass = [
      'absolute touch-none select-none',
      isActive ? 'z-30' : isSelected ? 'z-20' : 'z-10',
    ].join(' ');

    const frameClass = [
      'relative w-full h-full',
      !readOnly && isSelected ? 'outline outline-2 outline-cyan-500 outline-offset-0' : 'outline outline-1 outline-transparent',
      !readOnly && !isSelected ? 'hover:outline-cyan-300/60' : '',
      isActive ? 'shadow-lg' : '',
    ].filter(Boolean).join(' ');

    const moveAreaClass = [
      'w-full h-full flex items-center justify-center',
      readOnly ? '' : 'cursor-move',
      element.type === 'qr' ? 'border-2 border-dashed border-navy-300 bg-white/85' : '',
      element.type === 'image' ? 'overflow-hidden bg-white/75' : '',
      element.type === 'text' || element.type === 'placeholder' ? 'overflow-visible' : '',
      element.type === 'text' || element.type === 'placeholder'
        ? !readOnly && isSelected ? 'bg-cyan-500/5' : 'bg-transparent'
        : '',
      !readOnly && (element.type === 'text' || element.type === 'placeholder') && !isSelected
        ? 'hover:bg-cyan-500/5'
        : '',
    ].filter(Boolean).join(' ');

    const moveHandlers = readOnly ? {} : {
      onPointerDown: (e) => startMove(e, element),
      onPointerMove: (e) => handleMovePointerMove(e, element.id),
      onPointerUp: endInteraction,
      onPointerCancel: endInteraction,
    };

    let content = null;
    if (element.type === 'qr') {
      content = <span className="text-[10px] text-navy-600 pointer-events-none">QR</span>;
    } else if (element.type === 'image') {
      const imgSrc = resolveCertificateImageSrc(element.src);
      content = imgSrc ? (
        <img src={imgSrc} alt="" className="w-full h-full object-contain pointer-events-none" draggable={false} />
      ) : (
        <span className="text-xs text-navy-400 pointer-events-none">Logo</span>
      );
    } else {
      content = (
        <span
          className="w-full max-w-full flex items-center justify-center px-1 py-1 pointer-events-none break-words text-center"
          style={{
            color: style.color || '#0B1D36',
            fontSize: `${fontSizePtToPreviewPx(style.fontSize, canvas.heightMm, canvasPxHeight)}px`,
            fontWeight: style.bold ? '700' : '400',
            fontStyle: style.italic ? 'italic' : 'normal',
            textDecoration: style.underline ? 'underline' : 'none',
            lineHeight: style.bold ? 1.42 : 1.35,
            textAlign: style.align || 'center',
            fontFamily: resolveCertificateFont(style.fontFamily).cssFamily,
            ...(style.highlight
              ? {
                backgroundColor: style.highlight,
                padding: '2px 6px',
                borderRadius: '2px',
                boxDecorationBreak: 'clone',
                WebkitBoxDecorationBreak: 'clone',
              }
              : {}),
          }}
        >
          {resolveElementText(element, sampleData)}
        </span>
      );
    }

    return (
      <div key={element.id} className={wrapperClass} style={box}>
        <div className={frameClass}>
          <div {...moveHandlers} className={moveAreaClass}>
            {isSelected && !readOnly && (
              <span className="absolute top-0.5 left-0.5 p-0.5 rounded bg-cyan-600 text-white pointer-events-none opacity-80">
                <Move size={10} />
              </span>
            )}
            {content}
          </div>

          {isSelected && !readOnly && (
            <CertificateTransformHandles
              onHandlePointerDown={(e, handleId) => startResize(e, element, handleId)}
            />
          )}
        </div>
      </div>
    );
  };

  return (
    <div className={fullWidth ? 'w-full' : 'w-full flex justify-center'}>
      <div
        ref={canvasRef}
        className={`relative border shadow-md rounded-lg overflow-hidden w-full isolate ${
          fullWidth ? '' : 'max-w-4xl'
        } ${
          !readOnly && dropHint ? 'border-cyan-500 ring-2 ring-cyan-200' : 'border-navy-200'
        }`}
        style={{ aspectRatio }}
        onPointerDown={readOnly ? undefined : handleCanvasPointerDown}
        onDragOver={readOnly ? undefined : handleDragOver}
        onDragLeave={readOnly ? undefined : handleDragLeave}
        onDrop={readOnly ? undefined : handleDrop}
      >
        <CertificateBackgroundLayer themeId={theme} />

        <div className="absolute inset-0 z-[2]">
          {elements.map(renderElement)}
        </div>

        {!readOnly && dropHint && (
          <div className="absolute inset-0 z-[3] bg-cyan-500/10 pointer-events-none flex items-center justify-center">
            <span className="text-sm font-medium text-cyan-800 bg-white/90 px-3 py-1.5 rounded-lg shadow">
              Drop to place element
            </span>
          </div>
        )}

        {!hideChrome && !readOnly && (
          <div className="absolute bottom-2 right-2 text-[10px] text-navy-600 bg-white/90 px-2 py-0.5 rounded z-[4] pointer-events-none border border-navy-100">
            {orientation === 'portrait' ? 'Portrait' : 'Landscape'} · Drag to move · Handles to resize
          </div>
        )}
      </div>
    </div>
  );
}
