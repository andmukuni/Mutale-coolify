import { useEffect, useState } from 'react';
import { LoadingButton, FormField, StatusBadge } from '../../ui';
import { useToast } from '../../../context/ToastContext';
import {
  createEventResource,
  fetchEventResources,
  publishEventResource,
  revokeEventResource,
  uploadEventResource,
} from '../../../utils/emailCampaignsApi';

export default function EventResourcesPanel({ event }) {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [title, setTitle] = useState('');
  const [accessMode, setAccessMode] = useState('registrant_link');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const result = await fetchEventResources(event.id);
    setRows(result.data || []);
  };

  useEffect(() => { if (event?.id) void load().catch((error) => toast.error(error.message)); }, [event?.id]);

  return (
    <div className="space-y-5">
      <p className="text-sm text-navy-500">
        Files are stored privately and are not malware-scanned. They stay unpublished until you publish them.
        Verified sign-in access is Phase 2 and stays disabled.
      </p>
      <div className="grid sm:grid-cols-3 gap-3">
        <FormField label="Title">
          <input className="w-full rounded-xl border border-navy-200 px-3 py-2 text-sm" value={title} onChange={(e) => setTitle(e.target.value)} />
        </FormField>
        <FormField label="Access">
          <select className="w-full rounded-xl border border-navy-200 px-3 py-2 text-sm" value={accessMode} onChange={(e) => setAccessMode(e.target.value)}>
            <option value="registrant_link">Registrant link</option>
            <option value="public">Public</option>
            <option value="verified" disabled>Verified (Phase 2)</option>
          </select>
        </FormField>
        <div className="flex items-end">
          <LoadingButton
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await createEventResource(event.id, { title, access_mode: accessMode });
                setTitle('');
                await load();
              } catch (error) {
                toast.error(error.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Add resource
          </LoadingButton>
        </div>
      </div>
      <ul className="divide-y divide-navy-100">
        {rows.map((row) => (
          <li key={row.id} className="py-3 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-navy-900">{row.title}</p>
                <p className="text-xs text-navy-400">{row.access_mode} · {row.scan_note}</p>
              </div>
              <StatusBadge status={row.is_published ? 'published' : 'unpublished'} />
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                type="file"
                className="text-xs"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const content_base64 = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => {
                      const result = String(reader.result || '');
                      resolve(result.includes(',') ? result.split(',')[1] : result);
                    };
                    reader.onerror = () => reject(new Error('Could not read file.'));
                    reader.readAsDataURL(file);
                  });
                  try {
                    await uploadEventResource(event.id, row.id, {
                      file: { name: file.name, type: file.type, content_base64 },
                    });
                    toast.success('File uploaded. Publish when ready.');
                    await load();
                  } catch (error) {
                    toast.error(error.message);
                  }
                }}
              />
              <button type="button" className="text-xs text-cyan-700" onClick={() => publishEventResource(event.id, row.id, !row.is_published).then(load)}>
                {row.is_published ? 'Unpublish' : 'Publish'}
              </button>
              <button type="button" className="text-xs text-red-600" onClick={() => revokeEventResource(event.id, row.id).then(() => toast.success('Links revoked.'))}>
                Revoke links
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
