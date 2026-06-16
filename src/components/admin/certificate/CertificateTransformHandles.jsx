import { TRANSFORM_HANDLES } from '../../../../shared/certificateTransform.js';

export default function CertificateTransformHandles({
  onHandlePointerDown,
}) {
  return (
    <>
      {TRANSFORM_HANDLES.map((handle) => (
        <span
          key={handle.id}
          role="presentation"
          data-transform-handle={handle.id}
          onPointerDown={(e) => onHandlePointerDown(e, handle.id)}
          className="absolute z-40 w-2.5 h-2.5 -translate-x-1/2 -translate-y-1/2 bg-white border-2 border-cyan-600 shadow-sm rounded-[2px] hover:bg-cyan-50 hover:scale-110 transition-transform touch-none"
          style={{
            top: handle.top,
            left: handle.left,
            cursor: handle.cursor,
          }}
        />
      ))}
    </>
  );
}
