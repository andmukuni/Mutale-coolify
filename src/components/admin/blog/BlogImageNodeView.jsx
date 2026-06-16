import { useCallback, useEffect, useRef } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import {
  clampFreeImagePosition,
  clampPercent,
  layerZIndex,
} from '../../../../shared/blogImageLayout.js';

const HANDLES = [
  { id: 'nw', cursor: 'nwse-resize', top: 0, left: 0 },
  { id: 'n', cursor: 'ns-resize', top: 0, left: '50%' },
  { id: 'ne', cursor: 'nesw-resize', top: 0, right: 0 },
  { id: 'e', cursor: 'ew-resize', top: '50%', right: 0 },
  { id: 'se', cursor: 'nwse-resize', bottom: 0, right: 0 },
  { id: 's', cursor: 'ns-resize', bottom: 0, left: '50%' },
  { id: 'sw', cursor: 'nesw-resize', bottom: 0, left: 0 },
  { id: 'w', cursor: 'ew-resize', top: '50%', left: 0 },
];

const DRAG_THRESHOLD_PX = 5;

function getEditorCanvas(el) {
  return el?.closest?.('.tiptap') || null;
}

function getCanvasMetrics(frameEl, attrs = {}) {
  const canvas = getEditorCanvas(frameEl);
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  const img = frameEl?.querySelector?.('img');
  const imgRect = img?.getBoundingClientRect?.();
  return {
    canvasWidth: rect.width,
    canvasHeight: rect.height,
    width: imgRect?.width || Number(attrs.width) || 280,
    height: imgRect?.height || Number(attrs.height) || Math.round((Number(attrs.width) || 280) * 0.75),
  };
}

export default function BlogImageNodeView({
  node,
  updateAttributes,
  selected,
  editor,
  getPos,
}) {
  const { src, alt, layout, layer, x, y, width, height, align } = node.attrs;
  const isFree = layout === 'free';
  const frameRef = useRef(null);
  const dragRef = useRef(null);
  const pendingDragRef = useRef(null);

  const stopDrag = useCallback(() => {
    if (pendingDragRef.current) {
      window.removeEventListener('pointermove', pendingDragRef.current.onMove);
      window.removeEventListener('pointerup', pendingDragRef.current.onUp);
      window.removeEventListener('pointercancel', pendingDragRef.current.onUp);
      pendingDragRef.current = null;
    }
    if (!dragRef.current) return;
    window.removeEventListener('pointermove', dragRef.current.onMove);
    window.removeEventListener('pointerup', dragRef.current.onUp);
    window.removeEventListener('pointercancel', dragRef.current.onUp);
    dragRef.current = null;
  }, []);

  useEffect(() => () => stopDrag(), [stopDrag]);

  const clampToCanvas = useCallback((patch = {}) => {
    const metrics = getCanvasMetrics(frameRef.current, {
      width: patch.width ?? width,
      height: patch.height ?? height,
    });
    if (!metrics) return patch;
    return clampFreeImagePosition({
      x: patch.x ?? x,
      y: patch.y ?? y,
      width: patch.width ?? width,
      height: patch.height ?? height,
      canvasWidth: metrics.canvasWidth,
      canvasHeight: metrics.canvasHeight,
    });
  }, [x, y, width, height]);

  useEffect(() => {
    if (!isFree || !editor?.isEditable) return undefined;

    const applyClamp = () => {
      const metrics = getCanvasMetrics(frameRef.current, { width, height });
      if (!metrics) return;

      const clamped = clampFreeImagePosition({
        x,
        y,
        width,
        height,
        canvasWidth: metrics.canvasWidth,
        canvasHeight: metrics.canvasHeight,
      });

      const needsFix = (
        Math.abs(clamped.x - Number(x)) > 0.01
        || Math.abs(clamped.y - Number(y)) > 0.01
        || clamped.width !== Number(width)
        || clamped.height !== Number(height)
      );
      if (needsFix) updateAttributes(clamped);
    };

    applyClamp();
    const canvas = getEditorCanvas(frameRef.current);
    if (!canvas || typeof ResizeObserver === 'undefined') return undefined;

    const ro = new ResizeObserver(() => applyClamp());
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [isFree, editor?.isEditable, x, y, width, height, updateAttributes]);

  const selectThisNode = useCallback(() => {
    if (!editor?.isEditable) return;
    const pos = typeof getPos === 'function' ? getPos() : null;
    if (typeof pos !== 'number') return;
    editor.chain().focus().setNodeSelection(pos).run();
  }, [editor, getPos]);

  const runFreeDrag = useCallback((originX, originY, startX, startY) => {
    const canvas = getEditorCanvas(frameRef.current);
    if (!canvas) return;

    const canvasRect = canvas.getBoundingClientRect();

    const onMove = (ev) => {
      const dx = ((ev.clientX - originX) / canvasRect.width) * 100;
      const dy = ((ev.clientY - originY) / canvasRect.height) * 100;
      updateAttributes(clampToCanvas({
        x: startX + dx,
        y: startY + dy,
      }));
    };

    const onUp = () => stopDrag();
    dragRef.current = { onMove, onUp };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }, [stopDrag, updateAttributes, clampToCanvas]);

  const handleFramePointerDown = (e) => {
    if (!editor?.isEditable || e.button !== 0) return;

    selectThisNode();

    if (!isFree) return;

    const startX = clampPercent(x, 0);
    const startY = clampPercent(y, 0);
    const originX = e.clientX;
    const originY = e.clientY;

    const onMove = (ev) => {
      if (!dragRef.current) {
        const dist = Math.hypot(ev.clientX - originX, ev.clientY - originY);
        if (dist < DRAG_THRESHOLD_PX) return;
        ev.preventDefault();
        runFreeDrag(originX, originY, startX, startY);
      }
    };

    const onUp = () => stopDrag();
    pendingDragRef.current = { onMove, onUp };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const startResize = (e, handleId) => {
    if (!editor?.isEditable || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    selectThisNode();

    const img = frameRef.current?.querySelector('img');
    if (!img) return;

    const rect = img.getBoundingClientRect();
    const startW = rect.width;
    const startH = rect.height;
    const ratio = startH / startW || 1;
    const originX = e.clientX;
    const originY = e.clientY;
    const signX = handleId.includes('e') ? 1 : handleId.includes('w') ? -1 : 0;
    const signY = handleId.includes('s') ? 1 : handleId.includes('n') ? -1 : 0;

    const onMove = (ev) => {
      ev.preventDefault();
      let nextW = startW;
      if (signX !== 0) {
        const dw = (ev.clientX - originX) * signX;
        nextW = Math.max(80, Math.round(startW + dw));
      }
      if (signY !== 0 && signX === 0) {
        const dh = (ev.clientY - originY) * signY;
        const nextH = Math.max(60, Math.round(startH + dh));
        nextW = Math.max(80, Math.round(nextH / ratio));
      }
      const nextH = Math.round(nextW * ratio);
      updateAttributes(clampToCanvas({ width: nextW, height: nextH }));
    };

    const onUp = () => stopDrag();
    dragRef.current = { onMove, onUp };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const flowAlignClass = !isFree && align === 'left'
    ? 'blog-image-flow-left'
    : !isFree && align === 'right'
      ? 'blog-image-flow-right'
      : !isFree
        ? 'blog-image-flow-center'
        : '';

  const layerClass = isFree
    ? (layer === 'behind' ? 'blog-img-layer-behind' : 'blog-img-layer-front')
    : '';

  const isActive = selected;
  const metrics = isFree ? getCanvasMetrics(frameRef.current, { width, height }) : null;
  const bounded = isFree && metrics
    ? clampFreeImagePosition({
      x,
      y,
      width,
      height,
      canvasWidth: metrics.canvasWidth,
      canvasHeight: metrics.canvasHeight,
    })
    : { x: clampPercent(x, 0), y: clampPercent(y, 0), width, height };

  const wrapperStyle = isFree
    ? {
        position: 'absolute',
        left: `${bounded.x}%`,
        top: `${bounded.y}%`,
        zIndex: layerZIndex(layer),
        width: bounded.width ? `${bounded.width}px` : undefined,
        margin: 0,
        padding: 0,
        height: 0,
        overflow: 'visible',
        lineHeight: 0,
      }
    : undefined;

  const imgStyle = {
    width: bounded.width ? `${bounded.width}px` : undefined,
    height: bounded.height ? `${bounded.height}px` : undefined,
    maxWidth: isFree ? '100%' : '100%',
    display: 'block',
    borderRadius: '0.75rem',
    pointerEvents: 'none',
    userSelect: 'none',
  };

  return (
    <NodeViewWrapper
      as="div"
      className={`blog-image-node ${isFree ? 'blog-image-free' : `blog-image-flow ${flowAlignClass}`} ${layerClass} ${isActive ? 'is-selected' : ''}`}
      style={wrapperStyle}
      data-layout={layout}
      data-layer={layer}
      data-x={isFree ? bounded.x : undefined}
      data-y={isFree ? bounded.y : undefined}
      contentEditable={false}
    >
      <div
        ref={frameRef}
        role="button"
        tabIndex={-1}
        className={`blog-image-frame ${isActive ? 'is-active' : ''}`}
        onPointerDown={handleFramePointerDown}
        style={{ position: 'relative', display: 'inline-block', cursor: isFree ? 'grab' : 'pointer', touchAction: 'none' }}
      >
        <img
          src={src}
          alt={alt || ''}
          className="blog-inline-image"
          style={imgStyle}
          draggable={false}
        />

        {isActive && editor?.isEditable && (
          <>
            <span
              className="blog-image-selection-box"
              aria-hidden
            />
            {isFree && (
              <span
                className="blog-image-drag-badge"
                onPointerDown={(ev) => {
                  ev.stopPropagation();
                  selectThisNode();
                  runFreeDrag(ev.clientX, ev.clientY, bounded.x, bounded.y);
                }}
              >
                ⋮⋮ Drag
              </span>
            )}
            {HANDLES.map((h) => (
              <span
                key={h.id}
                role="presentation"
                data-handle={h.id}
                onPointerDown={(ev) => startResize(ev, h.id)}
                className="blog-image-handle"
                style={{
                  top: h.top ?? 'auto',
                  bottom: h.bottom ?? 'auto',
                  left: h.left ?? 'auto',
                  right: h.right ?? 'auto',
                  cursor: h.cursor,
                }}
              />
            ))}
          </>
        )}
      </div>
    </NodeViewWrapper>
  );
}
