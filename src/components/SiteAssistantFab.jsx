import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import SiteAssistantPanel from './SiteAssistantPanel';

export default function SiteAssistantFab() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const lift = /^\/events\/[^/]+$/.test(location.pathname) || /\/cart$/.test(location.pathname);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setMounted(true);
          setOpen(true);
        }}
        className={`fixed right-5 z-40 inline-flex items-center gap-2 rounded-full bg-[#141D45] px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-navy-900/25 hover:bg-[#1c2a63] ${
          open ? 'hidden' : ''
        } ${lift ? 'bottom-24 sm:bottom-6' : 'bottom-6'}`}
        aria-label="Open site assistant"
        aria-expanded={open}
      >
        <MessageCircle size={18} />
        <span className="hidden sm:inline">Ask Mutale</span>
      </button>
      {mounted ? (
        <SiteAssistantPanel open={open} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}
