import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import CampaignCreateModal from "../campaigns/CampaignCreateModal";
import { Megaphone, Plus } from "lucide-react";
import { LoadingButton, Spinner, StatusBadge } from "../../ui";
import EmptyState from "../../EmptyState";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";
import {
  createCampaign,
  fetchEventCampaigns,
} from "../../../utils/emailCampaignsApi";

export default function EventCampaignsPanel({ event }) {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchEventCampaigns(event.id);
      setRows(result.data || []);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [event?.id, toast]);

  useEffect(() => {
    if (event?.id) void load();
  }, [event?.id, load]);

  return (
    <div className="space-y-4">
      {creating && (
        <CampaignCreateModal
          open={creating}
          events={[event]}
          eventId={event.id}
          onClose={() => setCreating(false)}
          onCreate={async (payload) => {
            try {
              const created = await createCampaign(payload);
              navigate(`/admin/campaigns/${created.data.id}`);
            } catch (error) {
              toast.error(error.message);
            }
          }}
        />
      )}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-navy-500">
          Send event updates and invitations.
        </p>
        <LoadingButton
          disabled={!hasPermission("campaigns.manage")}
          icon={Plus}
          className="bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
          onClick={() => setCreating(true)}
        >
          New campaign
        </LoadingButton>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-navy-500">
          <Spinner size={16} />
          Loading campaigns…
        </div>
      ) : null}
      {!loading && rows.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No campaigns yet"
          description="Create a campaign to send updates or invitations for this event."
        />
      ) : null}
      <ul className="divide-y divide-navy-100">
        {rows.map((row) => (
          <li
            key={row.id}
            className="py-3 flex items-center justify-between gap-3"
          >
            <div>
              <Link
                to={`/admin/campaigns/${row.id}`}
                className="font-medium text-navy-900 hover:text-cyan-700"
              >
                {row.name}
              </Link>
              <p className="text-xs text-navy-500 mt-0.5">
                {row.subject || "No subject"}
              </p>
            </div>
            <StatusBadge status={row.state} />
          </li>
        ))}
      </ul>
    </div>
  );
}
