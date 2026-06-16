import { Link } from 'react-router-dom';
import {
  Users,
  Edit3,
  Copy,
  Award,
  Eye,
  Video,
  PlayCircle,
  ExternalLink,
  Loader2,
} from 'lucide-react';

function ActionButton({
  icon: Icon,
  label,
  onClick,
  to,
  href,
  disabled = false,
  primary = false,
  loading = false,
}) {
  const base = [
    'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors',
    'disabled:opacity-50 disabled:cursor-not-allowed',
    primary
      ? 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-sm'
      : 'bg-navy-100 hover:bg-navy-200 text-navy-800',
  ].join(' ');

  const inner = (
    <>
      {loading ? <Loader2 size={16} className="animate-spin" /> : <Icon size={16} />}
      {label}
    </>
  );

  if (href && !disabled) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={base}>
        {inner}
      </a>
    );
  }
  if (to && !disabled) {
    return <Link to={to} className={base}>{inner}</Link>;
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled || loading} className={base}>
      {inner}
    </button>
  );
}

export default function EventProfileQuickActions({
  eventId,
  isPastLocked,
  certConfigured,
  certBusy,
  hasVideoMeeting,
  videoProvider,
  zoomStartUrl,
  meetingLink,
  onActivateCertificate,
  onPreviewCertificate,
  onCreateVideoMeeting,
  onNavigateDesigner,
  videoLoading = false,
}) {
  return (
    <div className="bg-white border-b border-navy-100">
      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-3 flex flex-wrap gap-2">
        <ActionButton
          icon={Users}
          label="Manage attendees"
          to={`/admin/events/${eventId}/attendees`}
          primary
        />
        <ActionButton
          icon={Edit3}
          label="Edit event"
          to={isPastLocked ? undefined : `/admin/events/${eventId}/edit`}
          disabled={isPastLocked}
        />
        {!certConfigured ? (
          <ActionButton
            icon={Award}
            label="Set up certificates"
            onClick={onActivateCertificate}
            disabled={certBusy}
          />
        ) : (
          <>
            <ActionButton
              icon={Award}
              label="Certificate design"
              onClick={onNavigateDesigner}
            />
            <ActionButton
              icon={Eye}
              label="Preview"
              onClick={onPreviewCertificate}
              disabled={certBusy}
            />
          </>
        )}
        <ActionButton
          icon={Video}
          label={hasVideoMeeting ? 'Recreate room' : 'Create room'}
          onClick={onCreateVideoMeeting}
          disabled={videoLoading}
          loading={videoLoading}
        />
        {zoomStartUrl && (
          <ActionButton
            icon={PlayCircle}
            label="Start as host"
            href={zoomStartUrl}
          />
        )}
        {meetingLink && !zoomStartUrl && (
          <ActionButton icon={ExternalLink} label="Meeting link" href={meetingLink} />
        )}
        <ActionButton
          icon={Copy}
          label="Clone"
          to={`/admin/events/new?clone=${encodeURIComponent(eventId)}`}
        />
      </div>
    </div>
  );
}
