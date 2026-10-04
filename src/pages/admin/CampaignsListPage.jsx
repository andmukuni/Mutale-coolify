import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { PageHeader, Card, DataTable, Modal, FormField, LoadingButton, StatusBadge } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { useData } from '../../context/DataContext';
import { createCampaign, fetchCampaigns, fetchCampaignProviderStatus } from '../../utils/emailCampaignsApi';

export default function CampaignsListPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const { events } = useData();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [provider, setProvider] = useState(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ event_id: '', name: '', purpose: 'event_service' });

  const load = async () => {
    setLoading(true);
    try {
      const [list, status] = await Promise.all([
        fetchCampaigns(),
        fetchCampaignProviderStatus().catch(() => ({ data: null })),
      ]);
      setRows(list.data || []);
      setProvider(status.data || null);
    } catch (error) {
      toast.error(error.message || 'Unable to load campaigns.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const handleCreate = async () => {
    if (!form.event_id || !form.name.trim()) {
      toast.error('Choose an event and name the campaign.');
      return;
    }
    setSaving(true);
    try {
      const created = await createCampaign(form);
      setOpen(false);
      navigate(`/admin/campaigns/${created.data.id}`);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Campaigns"
        subtitle="Event service and promotional email. Transactional mail stays on SMTP."
        breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Campaigns' }]}
        actions={(
          <LoadingButton onClick={() => setOpen(true)} icon={Plus} className="bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-xl text-sm font-medium">New campaign</LoadingButton>
        )}
      />

      {provider && !provider.live && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {provider.notice}
        </div>
      )}

      <Card>
        <DataTable
          loading={loading}
          data={rows}
          emptyTitle="No campaigns yet"
          emptyDescription="Create an event campaign to start."
          onRowClick={(row) => navigate(`/admin/campaigns/${row.id}`)}
          columns={[
            { key: 'name', label: 'Campaign', render: (value, row) => (
              <div>
                <Link to={`/admin/campaigns/${row.id}`} className="font-semibold text-navy-900 hover:text-cyan-700">{value}</Link>
                <p className="text-xs text-navy-400">{row.subject || 'No subject yet'}</p>
              </div>
            ) },
            { key: 'purpose', label: 'Purpose' },
            { key: 'state', label: 'State', render: (value) => <StatusBadge status={value} /> },
            { key: 'event_id', label: 'Event', render: (value) => events.find((item) => item.id === value)?.title || value },
            { key: 'updated_at', label: 'Updated', render: (value) => value ? String(value).slice(0, 16) : '—' },
          ]}
        />
      </Card>

      <Modal isOpen={open} onClose={() => setOpen(false)} title="New campaign">
        <div className="space-y-3">
          <FormField label="Event">
            <select className="w-full rounded-xl border border-navy-200 px-3 py-2 text-sm" value={form.event_id} onChange={(e) => setForm((prev) => ({ ...prev, event_id: e.target.value }))}>
              <option value="">Select event</option>
              {events.map((event) => (
                <option key={event.id} value={event.id}>{event.title}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Name">
            <input className="w-full rounded-xl border border-navy-200 px-3 py-2 text-sm" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
          </FormField>
          <FormField label="Purpose">
            <select className="w-full rounded-xl border border-navy-200 px-3 py-2 text-sm" value={form.purpose} onChange={(e) => setForm((prev) => ({ ...prev, purpose: e.target.value }))}>
              <option value="event_service">Event service</option>
              <option value="promotional">Promotional</option>
            </select>
          </FormField>
          <LoadingButton loading={saving} onClick={handleCreate} className="bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-xl text-sm font-medium">Create and design</LoadingButton>
        </div>
      </Modal>
    </div>
  );
}
