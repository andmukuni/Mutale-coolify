import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import EventCreateChatPanel from './EventCreateChatPanel';

export default function EventCreateChatFab({ onCreated }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full bg-cyan-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-600/30 hover:bg-cyan-500"
        aria-label="Open event creation assistant"
      >
        <Sparkles size={18} />
        <span className="hidden sm:inline">Create with AI</span>
      </button>
      {open ? (
        <EventCreateChatPanel
          onClose={() => setOpen(false)}
          onCreated={onCreated}
        />
      ) : null}
    </>
  );
}
