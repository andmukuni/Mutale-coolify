import { Link } from 'react-router-dom';
import { CheckCircle, Clock, ArrowRight, CalendarX } from 'lucide-react';
import { useUserAuth } from '../../context/UserAuthContext';
import { useBooking } from '../../context/BookingContext';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { isEventPast } from '../../utils/eventServices';
import EmptyState from '../../components/EmptyState';
import RegistrationRow from './RegistrationRow';

export default function MyEventsPage() {
  const { currentUser } = useUserAuth();
  const { getUserRegistrations, cancelRegistration } = useBooking();
  const { events } = useData();
  const toast = useToast();

  const myRegistrations = getUserRegistrations(currentUser?.id || '');

  // Enrich registrations with live event data
  const enriched = myRegistrations.map(reg => ({
    ...reg,
    event: events.find(e => e.id === reg.event_id) || null,
  }));

  const upcoming = enriched.filter(r => r.status !== 'cancelled' && r.event && !isEventPast(r.event));
  const past = enriched.filter(r => r.status !== 'cancelled' && r.event && isEventPast(r.event));
  const cancelled = enriched.filter(r => r.status === 'cancelled');

  const handleCancel = async (regId) => {
    if (!window.confirm('Cancel this registration?')) return;
    try {
      await cancelRegistration(regId, currentUser.id);
      toast.success('Registration cancelled.');
    } catch (error) {
      toast.error(error?.message || 'Failed to cancel registration.');
    }
  };

  return (
    <div>
      {/* Header */}
      <section className="bg-gradient-to-br from-navy-950 via-navy-900 to-navy-800 text-white py-14 sm:py-18">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <span className="inline-block text-xs font-semibold uppercase tracking-widest text-cyan-400 mb-3">
            My Account
          </span>
          <h1 className="text-3xl sm:text-4xl font-bold mb-2">My Events</h1>
          <p className="text-navy-300">
            All your event registrations and subscriptions in one place.
          </p>
        </div>
      </section>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 space-y-12">
        {/* Summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total Registrations', value: myRegistrations.length, color: 'text-navy-900' },
            { label: 'Upcoming', value: upcoming.length, color: 'text-blue-700' },
            { label: 'Past', value: past.length, color: 'text-navy-500' },
            { label: 'Cancelled', value: cancelled.length, color: 'text-red-600' },
          ].map(stat => (
            <div key={stat.label} className="bg-white rounded-xl border border-navy-100 p-4 text-center">
              <div className={`text-2xl font-bold mb-1 ${stat.color}`}>{stat.value}</div>
              <div className="text-xs text-navy-500">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Upcoming events */}
        <div>
          <h2 className="text-lg font-bold text-navy-900 mb-4 flex items-center gap-2">
            <Clock size={18} className="text-cyan-600" />
            Upcoming ({upcoming.length})
          </h2>
          {upcoming.length === 0 ? (
            <EmptyState
              icon={CalendarX}
              title="No upcoming events"
              description="Browse and register for upcoming events."
              action={
                <Link
                  to="/events"
                  className="inline-flex items-center gap-2 mt-2 text-sm font-medium bg-cyan-600 text-white px-5 py-2.5 rounded-xl hover:bg-cyan-500 transition-colors"
                >
                  Browse Events <ArrowRight size={14} />
                </Link>
              }
            />
          ) : (
            <div className="space-y-3">
              {upcoming.map(reg => (
                <RegistrationRow
                  key={reg.id}
                  reg={reg}
                  onCancel={() => handleCancel(reg.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Past events */}
        {past.length > 0 && (
          <div>
            <h2 className="text-lg font-bold text-navy-900 mb-4 flex items-center gap-2">
              <CheckCircle size={18} className="text-navy-400" />
              Past Events ({past.length})
            </h2>
            <div className="space-y-3 opacity-80">
              {past.map(reg => (
                <RegistrationRow key={reg.id} reg={reg} isPast />
              ))}
            </div>
          </div>
        )}

        {/* Cancelled */}
        {cancelled.length > 0 && (
          <div>
            <h2 className="text-lg font-bold text-navy-900 mb-4 flex items-center gap-2">
              <CalendarX size={18} className="text-red-400" />
              Cancelled ({cancelled.length})
            </h2>
            <div className="space-y-3 opacity-70">
              {cancelled.map(reg => (
                <RegistrationRow key={reg.id} reg={reg} isPast />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

