import { Link } from 'react-router-dom';
import { Calendar, MapPin, Ticket } from 'lucide-react';
import { formatDate } from '../../utils/helpers';

const paymentColors = {
  paid: 'bg-green-50 text-green-700',
  unpaid: 'bg-red-50 text-red-600',
  pending: 'bg-amber-50 text-amber-700',
  processing: 'bg-amber-50 text-amber-700',
  not_required: 'bg-navy-50 text-navy-500',
  waived: 'bg-blue-50 text-blue-600',
};

const bookingStatusColors = {
  confirmed: 'bg-green-50 text-green-700',
  pending: 'bg-amber-50 text-amber-700',
  cancelled: 'bg-red-50 text-red-600',
  attended: 'bg-cyan-50 text-cyan-700',
};

export default function RegistrationRow({ reg, onCancel, isPast }) {
  const { event } = reg;
  if (!event) return null;

  const paymentLabel = String(reg.payment_status || '').replace(/_/g, ' ');

  return (
    <div className="bg-white rounded-2xl border border-navy-100 p-5 flex flex-col sm:flex-row sm:items-center gap-4">
      {event.cover_image && (
        <img
          src={event.cover_image}
          alt={event.title}
          className="w-full sm:w-20 h-20 rounded-xl object-cover shrink-0"
        />
      )}

      <div className="flex-1 min-w-0">
        <Link
          to={`/events/${event.slug}`}
          className="font-semibold text-navy-900 hover:text-cyan-700 transition-colors line-clamp-1"
        >
          {event.title}
        </Link>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
          <span className="flex items-center gap-1 text-xs text-navy-500">
            <Calendar size={12} />
            {formatDate(event.start_date || event.date)}
          </span>
          <span className="flex items-center gap-1 text-xs text-navy-500">
            <MapPin size={12} />
            {event.location}
          </span>
          <span className="flex items-center gap-1 text-xs text-navy-500">
            <Ticket size={12} />
            <span className="capitalize">{reg.registration_type}</span>
          </span>
          {String(reg.booked_for_name || '').trim() ? (
            <span className="text-xs text-cyan-700 font-medium">
              For: {String(reg.booked_for_name).trim()}
              {reg.booked_for_relation ? ` (${reg.booked_for_relation})` : ''}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${bookingStatusColors[reg.status] || 'bg-navy-50 text-navy-500'}`}>
            {reg.status}
          </span>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${paymentColors[reg.payment_status] || 'bg-navy-50 text-navy-500'}`}>
            {paymentLabel || '—'}
          </span>
          <span className="text-xs text-navy-400 font-mono">
            Ref: {reg.reference_code}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end sm:justify-start">
        <Link
          to={`/events/${event.slug}`}
          className="inline-flex items-center px-2.5 py-1.5 rounded-lg text-xs font-medium text-cyan-600 hover:text-cyan-700 hover:bg-cyan-50 transition-colors"
        >
          View
        </Link>
        {!isPast && reg.status === 'confirmed' && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
