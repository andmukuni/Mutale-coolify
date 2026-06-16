import {
  CalendarDays,
  FileEdit,
  Star,
  Eye,
  Users,
  Wallet,
  ArrowDownCircle,
  Hourglass,
  XCircle,
  RefreshCw,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../../context/DataContext';
import { useBooking } from '../../context/BookingContext';
import { PageHeader, AdminStatCard, Card, Spinner } from '../../components/ui';
import { formatDate } from '../../utils/helpers';
import { sortEventsByRecentlyCreated } from '../../utils/eventServices';
import { getApiBase } from '../../utils/apiBase';
import { getAdminAuthHeaders } from '../../utils/authHeaders';

const API_BASE = getApiBase();

export default function AdminDashboardPage() {
  const { events, blogPosts } = useData();
  const { registrations } = useBooking();
  const [chartProgress, setChartProgress] = useState(0);
  const [lencoData, setLencoData] = useState(null);
  const [lencoLoading, setLencoLoading] = useState(true);
  const [lencoError, setLencoError] = useState('');
  const [lencoRefreshing, setLencoRefreshing] = useState(false);
  const [usersCount, setUsersCount] = useState(0);

  useEffect(() => {
    let rafId;
    const duration = 900;
    const start = performance.now();

    const step = (now) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - ((1 - progress) ** 3);
      setChartProgress(eased);
      if (progress < 1) rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const loadLencoDashboard = useCallback(async ({ silent = false } = {}) => {
    if (silent) {
      setLencoRefreshing(true);
    } else {
      setLencoLoading(true);
    }
    setLencoError('');

    try {
      const response = await fetch(`${API_BASE}/payments/lenco/dashboard`, {
        headers: getAdminAuthHeaders(),
      });
      const json = await response.json().catch(() => ({}));

      if (!response.ok || !json?.ok) {
        throw new Error(json?.message || json?.error || `Failed to load Lenco dashboard (${response.status})`);
      }

      setLencoData(json.data || null);
    } catch (error) {
      setLencoError(error?.message || 'Unable to load Lenco payment dashboard.');
      setLencoData(null);
    } finally {
      setLencoLoading(false);
      setLencoRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadLencoDashboard().then(() => {
      if (cancelled) {
        setLencoLoading(false);
        setLencoRefreshing(false);
      }
    });
    return () => { cancelled = true; };
  }, [loadLencoDashboard]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/admin/users/count`, {
          cache: 'no-store',
          headers: getAdminAuthHeaders(),
        });
        const json = await res.json().catch(() => ({}));
        if (!cancelled && res.ok && typeof json.count === 'number') setUsersCount(json.count);
      } catch {
        if (!cancelled) setUsersCount(0);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const traffic = useMemo(() => getTrafficData(), []);

  const featuredEvents = events.filter((e) => e.featured);
  const upcomingEvents = events.filter(
    (e) => new Date(e.start_date || e.date) >= new Date()
  );
  const recentEvents = useMemo(() => sortEventsByRecentlyCreated(events), [events]);
  const totalCategories = [
    ...new Set(blogPosts.map((p) => p.category).filter(Boolean)),
  ].length;
  const confirmedRegs = registrations.filter((r) => r.status === 'confirmed').length;

  const eventStatusSlices = toSlices(
    countBy(events, (e) => (e.status || 'draft').toLowerCase()),
    {
      published: '#22c55e',
      draft: '#94a3b8',
      closed: '#f43f5e',
      cancelled: '#f97316',
    },
  );

  const registrationStatusSlices = toSlices(
    countBy(registrations, (r) => (r.status || 'confirmed').toLowerCase()),
    {
      confirmed: '#06b6d4',
      attended: '#22c55e',
      cancelled: '#f43f5e',
    },
  );

  const blogCategoryBars = toBars(countBy(blogPosts, (p) => p.category || 'Other'));

  const trafficTrendPoints = toTrendPoints(traffic.last7Days);
  const topPages = Object.entries(traffic.pages)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const totalViews = Object.values(traffic.daily).reduce((sum, n) => sum + Number(n || 0), 0);

  const stats = [
    {
      label: 'Total Events',
      value: events.length,
      icon: CalendarDays,
      color: 'cyan',
      subtitle: `${upcomingEvents.length} upcoming`,
      to: '/admin/events',
    },
    {
      label: 'Registrations',
      value: registrations.length,
      icon: Users,
      color: 'green',
      subtitle: `${confirmedRegs} confirmed`,
      to: '/admin/events',
    },
    {
      label: 'Site Views',
      value: totalViews,
      icon: Eye,
      color: 'purple',
      subtitle: `${traffic.last7Total} in last 7 days`,
    },
    {
      label: 'Blog Posts',
      value: blogPosts.length,
      icon: FileEdit,
      color: 'blue',
      subtitle: `${totalCategories} categories`,
      to: '/admin/blog',
    },
    {
      label: 'Featured Events',
      value: featuredEvents.length,
      icon: Star,
      color: 'amber',
      subtitle: 'Highlighted on homepage',
    },
    {
      label: 'Registered Users',
      value: usersCount,
      icon: Users,
      color: 'green',
      subtitle: 'Client accounts',
    },
  ];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Overview of your portfolio content"
        breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Dashboard' }]}
      />

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
        {stats.map((stat, index) => (
          <AdminStatCard key={stat.label} animationDelay={index * 70} {...stat} />
        ))}
      </div>

      <Card
        title="Payments Ledger"
        subtitle="Internal transaction records and recent collections"
        className="mb-6"
        actions={(
          <button
            type="button"
            onClick={() => loadLencoDashboard({ silent: true })}
            disabled={lencoLoading || lencoRefreshing}
            className="inline-flex items-center gap-1.5 text-xs text-cyan-600 hover:text-cyan-700 font-medium disabled:opacity-60"
          >
            {lencoRefreshing ? <Spinner size={14} /> : <RefreshCw size={14} />}
            Refresh
          </button>
        )}
      >
        {lencoLoading ? (
          <p className="text-sm text-navy-400">Loading Lenco balances and collections...</p>
        ) : lencoError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {lencoError}
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <MiniPaymentStat
                label="Available Balance"
                value={formatMoney(lencoData?.balances?.available, lencoData?.currency)}
                icon={Wallet}
                colorClass="text-cyan-600 bg-cyan-50"
              />
              <MiniPaymentStat
                label="Total Collected"
                value={formatMoney(lencoData?.summary?.totalCollected, lencoData?.currency)}
                icon={ArrowDownCircle}
                colorClass="text-green-600 bg-green-50"
              />
              <MiniPaymentStat
                label="Pending Collections"
                value={Number(lencoData?.summary?.pendingCount || 0)}
                icon={Hourglass}
                colorClass="text-amber-600 bg-amber-50"
              />
              <MiniPaymentStat
                label="Failed Collections"
                value={Number(lencoData?.summary?.failedCount || 0)}
                icon={XCircle}
                colorClass="text-red-600 bg-red-50"
              />
            </div>

            <div className="rounded-xl border border-navy-100 overflow-hidden">
              <div className="grid grid-cols-5 gap-3 px-4 py-2.5 bg-navy-50 text-[11px] uppercase tracking-wide font-semibold text-navy-500">
                <span>Reference</span>
                <span>Amount</span>
                <span>Status</span>
                <span>Channel</span>
                <span>Date</span>
              </div>

              {(lencoData?.collections || []).length === 0 ? (
                <p className="px-4 py-4 text-sm text-navy-400">No collection records returned yet.</p>
              ) : (
                <div>
                  {(lencoData?.collections || []).slice(0, 8).map((tx) => (
                    <div key={tx.id || tx.reference} className="grid grid-cols-5 gap-3 px-4 py-3 border-t border-navy-50 text-sm">
                      <span className="text-navy-700 truncate">{tx.reference || '—'}</span>
                      <span className="text-navy-700 font-medium">{formatMoney(tx.amount, tx.currency || lencoData?.currency)}</span>
                      <span>
                        <StatusPill status={tx.status} />
                      </span>
                      <span className="text-navy-500 capitalize truncate">{(tx.channel || 'unknown').replace(/_/g, ' ')}</span>
                      <span className="text-navy-500 text-xs">{tx.createdAt ? formatDate(tx.createdAt) : '—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="text-xs text-navy-400 flex flex-wrap gap-4">
              <span>Mode: <span className="font-medium text-navy-600 capitalize">{lencoData?.mode || 'unknown'}</span></span>
              <span>Account ID: <span className="font-medium text-navy-600">{lencoData?.accountId || '—'}</span></span>
            </div>
          </div>
        )}
      </Card>

      {/* Charts */}
      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        <Card title="Event Status Mix" subtitle="Distribution of event lifecycle states">
          <div className="flex flex-col items-center gap-4">
            <DonutChart slices={eventStatusSlices} progress={chartProgress} />
            <Legend items={eventStatusSlices} />
          </div>
        </Card>

        <Card title="Registration Outcomes" subtitle="Subscription status breakdown">
          <div className="flex flex-col items-center gap-4">
            <DonutChart slices={registrationStatusSlices} progress={chartProgress} />
            <Legend items={registrationStatusSlices} />
          </div>
        </Card>

        <Card title="Blog Categories" subtitle="Articles by category">
          <BarChart bars={blogCategoryBars} progress={chartProgress} />
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        <Card title="Site Traffic (Last 7 Days)" subtitle="Page views trend">
          <TrendChart points={trafficTrendPoints} progress={chartProgress} />
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            <TrafficMiniStat label="7-day" value={traffic.last7Total} />
            <TrafficMiniStat label="Prev 7-day" value={traffic.prev7Total} />
            <TrafficMiniStat label="Growth" value={`${traffic.growth}%`} />
          </div>
        </Card>

        <Card title="Top Visited Pages" subtitle="Most viewed routes">
          {topPages.length === 0 ? (
            <p className="text-sm text-navy-400">No traffic recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {topPages.map(([path, views]) => (
                <div key={path} className="flex items-center justify-between rounded-lg bg-navy-50 px-3 py-2">
                  <span className="text-sm text-navy-700 truncate pr-3">{path}</span>
                  <span className="text-xs font-semibold text-navy-500">{views} views</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Traffic Notes" subtitle="How this metric is tracked">
          <ul className="space-y-2 text-sm text-navy-600 list-disc pl-5">
            <li>Tracked automatically when a visitor opens a route.</li>
            <li>Stored locally under <code>mm_site_traffic</code>.</li>
            <li>Useful for demo insights without external analytics setup.</li>
          </ul>
        </Card>
      </div>

      {/* Content Sections */}
      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        {/* Recent Events */}
        <Card
          title="Recent Events"
          subtitle={`${events.length} total events`}
          actions={
            <Link
              to="/admin/events"
              className="text-xs text-cyan-600 hover:text-cyan-700 font-medium"
            >
              View all →
            </Link>
          }
        >
          {events.length === 0 ? (
            <p className="text-sm text-navy-400 text-center py-4">
              No events yet
            </p>
          ) : (
            <div className="space-y-0.5">
              {recentEvents.slice(0, 5).map((event) => (
                <div
                  key={event.id}
                  className="flex items-center justify-between py-2.5 border-b border-navy-50 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-navy-800 truncate">
                      {event.title}
                    </p>
                    <p className="text-xs text-navy-400 mt-0.5">
                      {event.category}
                    </p>
                  </div>
                  <span className="text-xs text-navy-400 shrink-0 ml-4">
                    {formatDate(event.date)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Recent Blog Posts */}
        <Card
          title="Recent Blog Posts"
          subtitle={`${blogPosts.length} total posts`}
          actions={
            <Link
              to="/admin/blog"
              className="text-xs text-cyan-600 hover:text-cyan-700 font-medium"
            >
              View all →
            </Link>
          }
        >
          {blogPosts.length === 0 ? (
            <p className="text-sm text-navy-400 text-center py-4">
              No posts yet
            </p>
          ) : (
            <div className="space-y-0.5">
              {blogPosts.slice(0, 5).map((post) => (
                <div
                  key={post.id}
                  className="flex items-center justify-between py-2.5 border-b border-navy-50 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-navy-800 truncate">
                      {post.title}
                    </p>
                    <p className="text-xs text-navy-400 mt-0.5">
                      {post.readTime}
                    </p>
                  </div>
                  <span className="shrink-0 ml-4 text-xs bg-cyan-50 text-cyan-700 px-2 py-0.5 rounded-full font-medium">
                    {post.category}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Quick Actions */}
      <Card title="Quick Actions" subtitle="Common tasks">
        <div className="grid sm:grid-cols-3 gap-3">
          <Link
            to="/admin/events/new"
            className="flex items-center gap-3 p-4 rounded-xl border border-navy-100 hover:border-cyan-200 hover:bg-cyan-50/50 transition-colors group"
          >
            <div className="p-2 rounded-lg bg-cyan-50 text-cyan-600 group-hover:bg-cyan-100 transition-colors">
              <CalendarDays size={18} />
            </div>
            <div>
              <p className="text-sm font-medium text-navy-800">New Event</p>
              <p className="text-xs text-navy-400">Create an event</p>
            </div>
          </Link>
          <Link
            to="/admin/blog/new"
            className="flex items-center gap-3 p-4 rounded-xl border border-navy-100 hover:border-cyan-200 hover:bg-cyan-50/50 transition-colors group"
          >
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600 group-hover:bg-blue-100 transition-colors">
              <FileEdit size={18} />
            </div>
            <div>
              <p className="text-sm font-medium text-navy-800">New Blog Post</p>
              <p className="text-xs text-navy-400">Write an article</p>
            </div>
          </Link>
          <Link
            to="/admin/settings"
            className="flex items-center gap-3 p-4 rounded-xl border border-navy-100 hover:border-cyan-200 hover:bg-cyan-50/50 transition-colors group"
          >
            <div className="p-2 rounded-lg bg-amber-50 text-amber-600 group-hover:bg-amber-100 transition-colors">
              <Star size={18} />
            </div>
            <div>
              <p className="text-sm font-medium text-navy-800">Settings</p>
              <p className="text-xs text-navy-400">Update profile info</p>
            </div>
          </Link>
        </div>
      </Card>
    </div>
  );
}

function getTrafficData() {
  const fallback = { daily: {}, pages: {} };

  let raw = fallback;
  try {
    raw = JSON.parse(localStorage.getItem('mm_site_traffic') || '{}') || fallback;
  } catch {
    raw = fallback;
  }

  const daily = raw.daily || {};
  const pages = raw.pages || {};

  const today = new Date();
  const last7Days = [];
  const prev7Days = [];

  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().split('T')[0];
    last7Days.push({ date: key.slice(5), value: Number(daily[key] || 0) });
  }

  for (let i = 13; i >= 7; i -= 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().split('T')[0];
    prev7Days.push(Number(daily[key] || 0));
  }

  const last7Total = last7Days.reduce((sum, d) => sum + d.value, 0);
  const prev7Total = prev7Days.reduce((sum, v) => sum + v, 0);
  const growth = prev7Total === 0 ? (last7Total > 0 ? 100 : 0) : Math.round(((last7Total - prev7Total) / prev7Total) * 100);

  return { daily, pages, last7Days, last7Total, prev7Total, growth };
}

function countBy(items, getKey) {
  return items.reduce((acc, item) => {
    const key = String(getKey(item) || 'Other');
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function toSlices(countMap, colorMap = {}) {
  const total = Object.values(countMap).reduce((sum, n) => sum + Number(n), 0);
  return Object.entries(countMap).map(([label, value]) => ({
    label,
    value,
    pct: total ? (Number(value) / total) * 100 : 0,
    color: colorMap[label] || '#06b6d4',
  }));
}

function toBars(countMap) {
  const entries = Object.entries(countMap)
    .map(([label, value]) => ({ label, value: Number(value) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
  const max = Math.max(1, ...entries.map((e) => e.value));
  return entries.map((e) => ({ ...e, pct: (e.value / max) * 100 }));
}

function toTrendPoints(days) {
  const max = Math.max(1, ...days.map((d) => d.value));
  return days.map((d, idx) => ({
    ...d,
    x: (idx / Math.max(1, days.length - 1)) * 100,
    y: 100 - (d.value / max) * 100,
  }));
}

function DonutChart({ slices, progress = 1 }) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const radius = 42;
  const stroke = 14;
  const circumference = 2 * Math.PI * radius;
  const segments = slices.reduce((acc, slice) => {
    const prevOffset = acc.length ? acc[acc.length - 1].offset + acc[acc.length - 1].length : 0;
    const length = total ? (slice.value / total) * circumference : 0;
    acc.push({ ...slice, length, offset: prevOffset });
    return acc;
  }, []);

  return (
    <div className="relative h-36 w-36">
      <svg viewBox="0 0 120 120" className="h-36 w-36 -rotate-90">
        <circle cx="60" cy="60" r={radius} stroke="#e2e8f0" strokeWidth={stroke} fill="none" />
        {segments.map((segment) => {
          const animatedLength = segment.length * progress;
          const dashArray = `${animatedLength} ${circumference - animatedLength}`;
          const dashOffset = -segment.offset;
          return (
            <circle
              key={segment.label}
              cx="60"
              cy="60"
              r={radius}
              stroke={segment.color}
              strokeWidth={stroke}
              fill="none"
              strokeDasharray={dashArray}
              strokeDashoffset={dashOffset}
              strokeLinecap="butt"
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-lg font-bold text-navy-900">{total}</p>
        <p className="text-[10px] uppercase tracking-wide text-navy-400">Total</p>
      </div>
    </div>
  );
}

function Legend({ items }) {
  return (
    <div className="w-full space-y-1.5">
      {items.map((item) => (
        <div key={item.label} className="flex items-center justify-between text-xs">
          <span className="inline-flex items-center gap-2 text-navy-600 capitalize">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />
            {item.label}
          </span>
          <span className="text-navy-500">{item.value} ({Math.round(item.pct)}%)</span>
        </div>
      ))}
    </div>
  );
}

function BarChart({ bars, progress = 1 }) {
  if (bars.length === 0) {
    return <p className="text-sm text-navy-400">No data yet.</p>;
  }

  return (
    <div className="space-y-2.5">
      {bars.map((bar) => (
        <div key={bar.label}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-navy-600 truncate pr-3">{bar.label}</span>
            <span className="text-navy-500 font-semibold">{bar.value}</span>
          </div>
          <div className="h-2 rounded-full bg-navy-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-cyan-500 transition-all duration-700"
              style={{ width: `${bar.pct * progress}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function TrendChart({ points, progress = 1 }) {
  if (points.length === 0) {
    return <p className="text-sm text-navy-400">No traffic data yet.</p>;
  }

  const path = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  return (
    <div>
      <svg viewBox="0 0 100 100" className="w-full h-32 rounded-lg bg-navy-50 border border-navy-100">
        <path
          d={path}
          fill="none"
          stroke="#06b6d4"
          strokeWidth="2.5"
          pathLength="1"
          strokeDasharray="1"
          strokeDashoffset={1 - progress}
        />
        {points.map((p) => (
          <circle key={p.date} cx={p.x} cy={p.y} r="2" fill="#0891b2" opacity={progress} />
        ))}
      </svg>
      <div className="mt-2 grid grid-cols-7 gap-1">
        {points.map((p) => (
          <div key={p.date} className="text-center">
            <p className="text-[10px] text-navy-400">{p.date}</p>
            <p className="text-xs font-semibold text-navy-700">{p.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrafficMiniStat({ label, value }) {
  return (
    <div className="rounded-lg bg-navy-50 px-2 py-2">
      <p className="text-[10px] uppercase tracking-wide text-navy-400">{label}</p>
      <p className="text-sm font-semibold text-navy-800">{value}</p>
    </div>
  );
}

function MiniPaymentStat({ label, value, icon: Icon, colorClass }) {
  return (
    <div className="rounded-xl border border-navy-100 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-navy-400">{label}</p>
          <p className="text-base font-semibold text-navy-800 mt-1">{value}</p>
        </div>
        <span className={`inline-flex p-2 rounded-lg ${colorClass}`}>
          <Icon size={16} />
        </span>
      </div>
    </div>
  );
}

function StatusPill({ status }) {
  const normalized = String(status || 'unknown').toLowerCase();
  const style = normalized === 'successful'
    ? 'bg-green-50 text-green-700 border-green-200'
    : normalized === 'pending'
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : normalized === 'failed'
        ? 'bg-red-50 text-red-700 border-red-200'
        : 'bg-navy-50 text-navy-600 border-navy-200';

  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full border text-xs font-medium capitalize ${style}`}>
      {normalized}
    </span>
  );
}

function formatMoney(value, currency = 'ZMW') {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return `0 ${currency}`;

  try {
    return new Intl.NumberFormat('en-ZM', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}
