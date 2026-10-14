import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Megaphone,
  Send,
  MailCheck,
  MailOpen,
  MousePointerClick,
  AlertTriangle,
  Ban,
  UserMinus,
  Info,
} from "lucide-react";
import {
  PageHeader,
  Card,
  AdminStatCard,
  DataTable,
} from "../../components/ui";
import CampaignWorkspaceNav from "../../components/admin/campaigns/CampaignWorkspaceNav";
import { INPUT_SM } from "../../components/admin/campaigns/campaignStyles";
import { campaignDashboard } from "../../utils/campaignWorkspaceApi";
import { useToast } from "../../context/ToastContext";

const PERIODS = [
  ["week", "Last 7 days"],
  ["month", "Last 30 days"],
  ["quarter", "Last 90 days"],
  ["year", "Last year"],
  ["all", "All time"],
];

const rate = (part, whole) =>
  whole ? `${((Number(part || 0) / Number(whole)) * 100).toFixed(1)}%` : "0%";

export default function CampaignDashboardPage() {
  const toast = useToast();
  const [period, setPeriod] = useState("month");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    campaignDashboard(period)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((e) => toast.error(e.message))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [period, toast]);

  const total = data?.totals || {};
  const stats = [
    { label: "Campaigns", value: total.campaigns, icon: Megaphone, color: "navy" },
    { label: "Sent", value: total.sent, icon: Send, color: "cyan" },
    {
      label: "Delivered",
      value: total.delivered,
      icon: MailCheck,
      color: "green",
      subtitle: `${rate(total.delivered, total.sent)} of sent`,
    },
    {
      label: "Opened",
      value: total.opened,
      icon: MailOpen,
      color: "blue",
      subtitle: `${rate(total.opened, total.sent)} open rate`,
    },
    {
      label: "Clicked",
      value: total.clicked,
      icon: MousePointerClick,
      color: "purple",
      subtitle: `${rate(total.clicked, total.sent)} click rate`,
    },
    {
      label: "Bounced",
      value: total.bounced,
      icon: AlertTriangle,
      color: "amber",
      subtitle: `${rate(total.bounced, total.sent)} of sent`,
    },
    {
      label: "Hard bounced",
      value: data?.hard_bounced,
      icon: Ban,
      color: "red",
      subtitle: "Currently on the suppression list",
      to: "/admin/campaigns/manage/suppressions",
    },
    {
      label: "Unsubscribed",
      value: data?.unsubscribed,
      icon: UserMinus,
      color: "navy",
      subtitle: "Currently on the suppression list",
      to: "/admin/campaigns/manage/suppressions",
    },
  ];

  const recentColumns = [
    {
      key: "name",
      label: "Campaign",
      render: (_v, row) => (
        <div>
          <Link
            className="font-medium text-navy-900 hover:text-cyan-700"
            to={`/admin/campaigns/${row.id}/report`}
          >
            {row.name}
          </Link>
          <p className="text-xs text-navy-500 mt-0.5">{row.subject}</p>
        </div>
      ),
    },
    {
      key: "sent",
      label: "Sent",
      align: "right",
      render: (v) => <span className="tabular-nums">{v ?? 0}</span>,
    },
    {
      key: "opened",
      label: "Opened",
      align: "right",
      render: (v, row) => (
        <span className="tabular-nums">
          {v ?? 0}{" "}
          <span className="text-xs text-navy-400">({rate(v, row.sent)})</span>
        </span>
      ),
    },
    {
      key: "clicked",
      label: "Clicked",
      align: "right",
      render: (v, row) => (
        <span className="tabular-nums">
          {v ?? 0}{" "}
          <span className="text-xs text-navy-400">({rate(v, row.sent)})</span>
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <PageHeader
          title="Campaign dashboard"
          subtitle="Email delivery and engagement across your campaigns."
          breadcrumbs={[
            { label: "Admin", to: "/admin" },
            { label: "Campaigns", to: "/admin/campaigns" },
            { label: "Dashboard" },
          ]}
          actions={
            <select
              aria-label="Reporting period"
              className={`${INPUT_SM} w-44`}
              value={period}
              onChange={(e) => {
                setLoading(true);
                setPeriod(e.target.value);
              }}
            >
              {PERIODS.map(([id, label]) => (
                <option value={id} key={id}>
                  {label}
                </option>
              ))}
            </select>
          }
        />
        <CampaignWorkspaceNav />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => (
          <AdminStatCard
            key={stat.label}
            {...stat}
            value={stat.value ?? 0}
            loading={loading}
            animationDelay={index * 60}
          />
        ))}
      </div>

      <Card
        title="Recent campaigns"
        subtitle="Latest sent campaigns in the selected period."
      >
        <DataTable
          columns={recentColumns}
          data={data?.recent || []}
          loading={loading}
          emptyTitle="No campaign results yet"
          emptyDescription="Your campaign results will appear here after sending."
        />
      </Card>

      <p className="flex items-start gap-2 text-xs text-navy-500">
        <Info size={14} className="mt-0.5 shrink-0" />
        Open and click statistics are estimates. Hard bounce and unsubscribe
        totals show the current suppression lists.
      </p>
    </div>
  );
}
