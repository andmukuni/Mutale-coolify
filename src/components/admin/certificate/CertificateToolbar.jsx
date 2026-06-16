import { Type, User, Calendar, Hash, QrCode, ImagePlus } from 'lucide-react';
import {
  createDesignElement,
  PLACEHOLDER_KEYS,
} from '../../../../shared/certificateDesign.js';
import CertificateBackgroundPicker from './CertificateBackgroundPicker.jsx';
import CertificatePresetPicker from './CertificatePresetPicker.jsx';
import CertificateSealPicker from './CertificateSealPicker.jsx';

const PLACEHOLDER_BUTTONS = [
  { key: 'attendee_name', label: 'Attendee Name', icon: User },
  { key: 'event_name', label: 'Event Title', icon: Type },
  { key: 'event_date', label: 'Event Date', icon: Calendar },
  { key: 'issue_date', label: 'Issue Date', icon: Calendar },
  { key: 'certificate_number', label: 'Certificate #', icon: Hash },
];

function DraggableChip({ label, icon: Icon, payload, onQuickAdd }) {
  const handleDragStart = (e) => {
    e.dataTransfer.setData('application/x-cert-element', JSON.stringify(payload));
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <button
      type="button"
      draggable
      onDragStart={handleDragStart}
      onClick={() => onQuickAdd?.(payload)}
      className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-navy-200 hover:border-cyan-400 hover:text-cyan-700 cursor-grab active:cursor-grabbing bg-white"
      title="Drag onto canvas or click to add"
    >
      <Icon size={13} />
      {label}
    </button>
  );
}

export default function CertificateToolbar({
  onAddElement,
  onDropPayload,
  presetId,
  onPresetChange,
  backgroundTheme,
  onBackgroundThemeChange,
  sealId,
  onSealChange,
  orientation,
  onOrientationChange,
  canvas,
  sampleData = {},
}) {
  const addFromPayload = (payload) => {
    if (payload.elementType === 'text') {
      onAddElement?.(createDesignElement('text', { content: payload.content || 'New text', canvas }));
      return;
    }
    if (payload.elementType === 'placeholder') {
      onAddElement?.(createDesignElement('placeholder', { key: payload.key, canvas, sampleData }));
      return;
    }
    if (payload.elementType === 'qr') {
      onAddElement?.(createDesignElement('qr', { canvas }));
    }
  };

  return (
    <div className="space-y-5">
      <CertificatePresetPicker
        value={presetId}
        onChange={onPresetChange}
      />

      <CertificateBackgroundPicker
        value={backgroundTheme}
        onChange={onBackgroundThemeChange}
      />

      <CertificateSealPicker
        value={sealId}
        onChange={onSealChange}
      />

      <div>
        <p className="text-xs font-semibold text-navy-500 uppercase tracking-wide mb-2">Page</p>
        <select
          value={orientation}
          onChange={(e) => onOrientationChange?.(e.target.value)}
          className="text-sm px-3 py-2 rounded-lg border border-navy-200 bg-white w-full"
        >
          <option value="landscape">Landscape A4</option>
          <option value="portrait">Portrait A4</option>
        </select>
      </div>

      <div>
        <p className="text-xs font-semibold text-navy-500 uppercase tracking-wide mb-2">Drag onto canvas</p>
        <p className="text-[11px] text-navy-400 mb-2">Drag a field to the certificate, or click to add at center.</p>
        <div className="flex flex-wrap gap-2">
          <DraggableChip
            label="Text"
            icon={Type}
            payload={{ elementType: 'text', content: 'New text' }}
            onQuickAdd={addFromPayload}
          />
          {PLACEHOLDER_BUTTONS.map(({ key, label, icon }) => (
            <DraggableChip
              key={key}
              label={label}
              icon={icon}
              payload={{ elementType: 'placeholder', key }}
              onQuickAdd={addFromPayload}
            />
          ))}
          <DraggableChip
            label="QR Code"
            icon={QrCode}
            payload={{ elementType: 'qr' }}
            onQuickAdd={addFromPayload}
          />
          <label className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-navy-200 hover:border-cyan-400 cursor-pointer bg-white">
            <ImagePlus size={13} />
            Logo / Image
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                  onAddElement?.(createDesignElement('image', { src: reader.result }));
                };
                reader.readAsDataURL(file);
                e.target.value = '';
              }}
            />
          </label>
        </div>
        <p className="text-[11px] text-navy-400 mt-2">
          Placeholders: {PLACEHOLDER_KEYS.map((k) => `{{${k}}}`).join(', ')}
        </p>
      </div>
    </div>
  );
}
