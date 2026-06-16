import { useState, useEffect, useCallback } from 'react';
import { Save, Truck } from 'lucide-react';
import { PageHeader, Card, FormField, LoadingButton } from '../../components/ui';
import { getApiBase } from '../../utils/apiBase';
import { getAdminAuthHeaders } from '../../utils/authHeaders';
import { useToast } from '../../context/ToastContext';

const API_BASE = getApiBase();

const defaultZone = { label: '', flatRate: 0, method: 'flat', baseRate: 0, perKgRate: 0 };

export default function ShippingSettingsPage() {
  const toast = useToast();
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/shipping/config`, {
        headers: getAdminAuthHeaders(),
      });
      const json = await res.json();
      setConfig(json?.data || {});
    } catch {
      setError('Failed to load shipping config.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const res = await fetch(`${API_BASE}/shipping/config`, {
        method: 'PUT',
        headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(config),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.message);
      setSaved(true);
      toast.success('Shipping config saved.');
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      const msg = err?.message || 'Failed to save shipping config.';
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field, value) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const updateZone = (zoneKey, field, value) => {
    setConfig(prev => ({
      ...prev,
      zones: {
        ...prev.zones,
        [zoneKey]: {
          ...(prev.zones?.[zoneKey] || defaultZone),
          [field]: value,
        },
      },
    }));
  };

  if (loading || !config) {
    return (
      <div className="space-y-6">
        <PageHeader title="Shipping Settings" subtitle="Configure shipping zones and rates" />
        <div className="text-center py-12 text-navy-400 text-sm">Loading…</div>
      </div>
    );
  }

  const zones = config.zones || {};

  return (
    <div className="space-y-6">
      <PageHeader
        title="Shipping Settings"
        subtitle="Configure shipping zones and rates"
        action={
          <LoadingButton
            onClick={handleSave}
            loading={saving}
            loadingLabel="Saving…"
            icon={Save}
            className="bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
          >
            Save Changes
          </LoadingButton>
        }
      />

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {saved && <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700">Shipping settings saved successfully!</div>}

      {/* Global settings */}
      <Card title="General">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <FormField label="Default Method">
            <select
              value={config.defaultMethod || 'flat'}
              onChange={e => updateField('defaultMethod', e.target.value)}
              className="w-full rounded-lg border border-navy-200 px-3 py-2 text-sm"
            >
              <option value="flat">Flat Rate</option>
              <option value="weight">Weight-Based</option>
            </select>
          </FormField>
          <FormField label="Flat Rate (ZMW)">
            <input
              type="number" step="0.01" min="0"
              value={config.flatRate ?? 0}
              onChange={e => updateField('flatRate', Number(e.target.value))}
              className="w-full rounded-lg border border-navy-200 px-3 py-2 text-sm"
            />
          </FormField>
          <FormField label="Base Rate (ZMW)">
            <input
              type="number" step="0.01" min="0"
              value={config.baseRate ?? 0}
              onChange={e => updateField('baseRate', Number(e.target.value))}
              className="w-full rounded-lg border border-navy-200 px-3 py-2 text-sm"
            />
          </FormField>
          <FormField label="Per Kg Rate (ZMW)">
            <input
              type="number" step="0.01" min="0"
              value={config.perKgRate ?? 0}
              onChange={e => updateField('perKgRate', Number(e.target.value))}
              className="w-full rounded-lg border border-navy-200 px-3 py-2 text-sm"
            />
          </FormField>
        </div>
      </Card>

      {/* Free shipping */}
      <Card title="Free Shipping">
        <div className="flex items-center gap-6 flex-wrap">
          <label className="flex items-center gap-2 text-sm text-navy-700 cursor-pointer">
            <input
              type="checkbox"
              checked={config.freeShippingEnabled ?? false}
              onChange={e => updateField('freeShippingEnabled', e.target.checked)}
              className="rounded border-navy-300"
            />
            Enable free shipping
          </label>
          <FormField label="Threshold (ZMW)">
            <input
              type="number" step="0.01" min="0"
              value={config.freeShippingThreshold ?? 0}
              onChange={e => updateField('freeShippingThreshold', Number(e.target.value))}
              className="w-full rounded-lg border border-navy-200 px-3 py-2 text-sm"
              disabled={!config.freeShippingEnabled}
            />
          </FormField>
        </div>
      </Card>

      {/* Zones */}
      <Card title="Shipping Zones">
        <div className="space-y-6">
          {['domestic', 'regional', 'international'].map(key => {
            const zone = zones[key] || defaultZone;
            return (
              <div key={key} className="border border-navy-100 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Truck size={16} className="text-cyan-600" />
                  <h4 className="text-sm font-bold text-navy-800 capitalize">{key}</h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  <FormField label="Label">
                    <input
                      value={zone.label || ''}
                      onChange={e => updateZone(key, 'label', e.target.value)}
                      className="w-full rounded-lg border border-navy-200 px-3 py-2 text-sm"
                    />
                  </FormField>
                  <FormField label="Method">
                    <select
                      value={zone.method || 'flat'}
                      onChange={e => updateZone(key, 'method', e.target.value)}
                      className="w-full rounded-lg border border-navy-200 px-3 py-2 text-sm"
                    >
                      <option value="flat">Flat Rate</option>
                      <option value="weight">Weight-Based</option>
                    </select>
                  </FormField>
                  <FormField label="Flat Rate (ZMW)">
                    <input
                      type="number" step="0.01" min="0"
                      value={zone.flatRate ?? 0}
                      onChange={e => updateZone(key, 'flatRate', Number(e.target.value))}
                      className="w-full rounded-lg border border-navy-200 px-3 py-2 text-sm"
                    />
                  </FormField>
                  <FormField label="Base Rate (ZMW)">
                    <input
                      type="number" step="0.01" min="0"
                      value={zone.baseRate ?? 0}
                      onChange={e => updateZone(key, 'baseRate', Number(e.target.value))}
                      className="w-full rounded-lg border border-navy-200 px-3 py-2 text-sm"
                    />
                  </FormField>
                  <FormField label="Per Kg Rate (ZMW)">
                    <input
                      type="number" step="0.01" min="0"
                      value={zone.perKgRate ?? 0}
                      onChange={e => updateZone(key, 'perKgRate', Number(e.target.value))}
                      className="w-full rounded-lg border border-navy-200 px-3 py-2 text-sm"
                    />
                  </FormField>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
