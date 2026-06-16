import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';

export default function ItemListControls({ index, total, onMoveUp, onMoveDown, onRemove, removeLabel = 'Remove' }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onMoveUp}
        disabled={index === 0}
        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-navy-200 text-navy-600 hover:bg-navy-50 disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="Move up"
      >
        <ChevronUp size={14} />
        Up
      </button>
      <button
        type="button"
        onClick={onMoveDown}
        disabled={index >= total - 1}
        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-navy-200 text-navy-600 hover:bg-navy-50 disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="Move down"
      >
        <ChevronDown size={14} />
        Down
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50"
      >
        <Trash2 size={14} />
        {removeLabel}
      </button>
    </div>
  );
}
