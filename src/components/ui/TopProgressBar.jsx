/**
 * Top progress bar that animates on route changes.
 */
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

export default function TopProgressBar() {
  const location = useLocation();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Start the bar on next tick to avoid sync setState in effect
    const t0 = setTimeout(() => {
      setVisible(true);
      setProgress(30);
    }, 0);

    const t1 = setTimeout(() => setProgress(60), 150);
    const t2 = setTimeout(() => setProgress(80), 400);
    const t3 = setTimeout(() => {
      setProgress(100);
      setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 300);
    }, 600);

    return () => {
      clearTimeout(t0);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [location.pathname]);

  if (!visible && progress === 0) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[10000] h-[3px]">
      <div
        className="h-full bg-gradient-to-r from-navy-600 via-navy-400 to-navy-600 transition-all duration-300 ease-out"
        style={{
          width: `${progress}%`,
          opacity: visible ? 1 : 0,
        }}
      />
    </div>
  );
}
