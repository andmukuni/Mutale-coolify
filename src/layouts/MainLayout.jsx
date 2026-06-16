import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import ScrollToTop from '../components/ScrollToTop';
import { MenuProvider } from '../context/MenuContext';

export default function MainLayout() {
  const location = useLocation();

  useEffect(() => {
    try {
      const key = 'mm_site_traffic';
      const existing = JSON.parse(localStorage.getItem(key) || '{}');
      const today = new Date().toISOString().split('T')[0];

      const next = {
        daily: { ...(existing.daily || {}) },
        pages: { ...(existing.pages || {}) },
        updated_at: new Date().toISOString(),
      };

      next.daily[today] = Number(next.daily[today] || 0) + 1;
      next.pages[location.pathname] = Number(next.pages[location.pathname] || 0) + 1;

      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // no-op in case storage is unavailable
    }
  }, [location.pathname]);

  return (
    <MenuProvider>
      <div className="min-h-screen flex flex-col bg-navy-50">
        <ScrollToTop />
        <Navbar />
        <main className="flex-1">
          <Outlet />
        </main>
        <Footer />
      </div>
    </MenuProvider>
  );
}
