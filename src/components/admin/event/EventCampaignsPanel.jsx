import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { LoadingButton, StatusBadge } from '../../ui';
import { useToast } from '../../../context/ToastContext';
import { createCampaign, fetchEventCampaigns } from '../../../utils/emailCampaignsApi';

export default function EventCampaignsPanel({ event }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const result = await fetchEventCampaigns(event.id);
      setRows(result.data || []);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (event?.id) void load(); }, [event?.id]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-navy-500">Event service and promotional campaigns. Transactional tickets stay on SMTP.</p>
        <LoadingButton
          icon={Plus}
          className="bg-cyan-600 hover:bg-cyan-500 text-white px-3 py-2 rounded-xl text-sm font-medium"
          onClick={async () => {
            try {
              const created = await createCampaign({
                event_id: event.id,
                name: `${event.title} update`,
                purpose: 'event_service',
              });
              navigate(`/admin/campaigns/${created.data.id}`);
            } catch (error) {
              toast.error(error.message);
            }
          }}
        >
          New campaign
        </LoadingButton>
      </div>
      {loading ? <p className="text-sm text-navy-500">Loading campaigns…</p> : null}
      {!loading && rows.length === 0 ? <p className="text-sm text-navy-500">No campaigns for this event yet.</p> : null}
      <ul className="divide-y divide-navy-100">
        {rows.map((row) => (
          <li key={row.id} className="py-3 flex items-center justify-between gap-3">
            <div>
              <Link to={`/admin/campaigns/${row.id}`} className="font-semibold text-navy-900 hover:text-cyan-700">{row.name}</Link>
              <p className="text-xs text-navy-400">{row.subject || 'No subject'}</p>
            </div>
            <StatusBadge status={row.state} />
          </li>
        ))}
      </ul>
    </div>
  );
}
