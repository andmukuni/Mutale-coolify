import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

const OPTIONS = [
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'system', label: 'System', icon: Monitor },
];

export default function ThemeToggle({ variant = 'icon' }) {
  const { preference, resolvedTheme, setPreference, toggleTheme } = useTheme();

  if (variant === 'compact') {
    const Icon = resolvedTheme === 'dark' ? Moon : Sun;
    return (
      <button
        type="button"
        onClick={toggleTheme}
        className="inline-flex items-center justify-center h-9 w-9 rounded-lg text-navy-300 hover:text-white hover:bg-navy-800 transition-colors"
        title={resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        aria-label={resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        <Icon size={17} />
      </button>
    );
  }

  if (variant === 'admin') {
    const Icon = resolvedTheme === 'dark' ? Moon : Sun;
    return (
      <button
        type="button"
        onClick={toggleTheme}
        className="inline-flex items-center justify-center h-9 w-9 rounded-lg text-navy-500 hover:bg-navy-100 hover:text-navy-700 dark:text-navy-300 dark:hover:bg-navy-800 dark:hover:text-white transition-colors"
        title={resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        aria-label={resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        <Icon size={17} />
      </button>
    );
  }

  if (variant === 'segmented') {
    return (
      <div className="inline-flex items-center rounded-xl border border-navy-200 dark:border-navy-700 bg-white dark:bg-navy-900 p-1 gap-0.5">
        {OPTIONS.map(({ id, label, icon: Icon }) => {
          const active = preference === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setPreference(id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                active
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-navy-600 dark:text-navy-300 hover:bg-navy-50 dark:hover:bg-navy-800'
              }`}
              title={label}
              aria-label={`${label} theme`}
              aria-pressed={active}
            >
              <Icon size={14} />
              <span className="hidden sm:inline">{label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  const Icon = resolvedTheme === 'dark' ? Moon : Sun;
  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="inline-flex items-center justify-center h-9 w-9 rounded-lg text-navy-200 hover:text-cyan-400 hover:bg-navy-800/60 transition-colors"
      title={resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <Icon size={17} />
    </button>
  );
}
