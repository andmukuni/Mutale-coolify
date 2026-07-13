import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useUserAuth } from '../context/UserAuthContext';
import { isEventPubliclyVisible } from '../utils/eventServices';
import { resolveUserBearerToken } from '../utils/authHeaders';
import EventRegistrationFlow from '../components/BookingModal';

export default function EventRegisterPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { events, isDataLoaded } = useData();
  const { isUserAuthenticated } = useUserAuth();

  const event = events.find((item) => item.slug === slug);
  const registerPath = `/events/${slug}/register`;

  useEffect(() => {
    if (!isDataLoaded) return;
    if (!isUserAuthenticated || !resolveUserBearerToken()) {
      navigate('/account/login', { state: { from: { pathname: registerPath } } });
    }
  }, [isDataLoaded, isUserAuthenticated, navigate, registerPath]);

  if (!isDataLoaded) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center bg-navy-50">
        <div className="w-8 h-8 rounded-full border-4 border-navy-100 border-t-navy-900 animate-spin" />
      </div>
    );
  }

  if (!event || !isEventPubliclyVisible(event)) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center gap-4 text-navy-500 bg-navy-50">
        <AlertCircle size={40} className="text-navy-300" />
        <h2 className="text-xl font-semibold text-navy-700">Event not found</h2>
        <Link to="/events" className="text-cyan-600 hover:underline text-sm">
          ← Back to Events
        </Link>
      </div>
    );
  }

  if (!isUserAuthenticated || !resolveUserBearerToken()) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center bg-navy-50">
        <div className="w-8 h-8 rounded-full border-4 border-navy-100 border-t-navy-900 animate-spin" />
      </div>
    );
  }

  return (
    <EventRegistrationFlow
      event={event}
      layout="page"
      backHref={`/events/${slug}`}
      onClose={() => navigate(`/events/${slug}`)}
    />
  );
}
