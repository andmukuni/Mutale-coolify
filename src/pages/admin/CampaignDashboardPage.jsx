import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader, Card } from "../../components/ui";
import CampaignWorkspaceNav from "../../components/admin/campaigns/CampaignWorkspaceNav";
import { campaignDashboard } from "../../utils/campaignWorkspaceApi";
import { useToast } from "../../context/ToastContext";
export default function CampaignDashboardPage() {
  const toast = useToast();
  const [period, setPeriod] = useState("month"),
    [data, setData] = useState(null);
  useEffect(() => {
    void campaignDashboard(period)
      .then(setData)
      .catch((e) => toast.error(e.message));
  }, [period, toast]);
  const total = data?.totals;
  return (
    <div>
      <CampaignWorkspaceNav />
      <PageHeader
        title="Campaign Dashboard"
        subtitle="Email delivery and engagement across your campaigns."
        actions={
          <select
            aria-label="Reporting period"
            className="border rounded-lg p-2 text-sm"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          >
            {[
              ["week", "Last 7 Days"],
              ["month", "Last 30 Days"],
              ["quarter", "Last 90 Days"],
              ["year", "Last Year"],
              ["all", "All Time"],
            ].map(([id, label]) => (
              <option value={id} key={id}>
                {label}
              </option>
            ))}
          </select>
        }
      />
      {!data ? (
        <p>Loading dashboard…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              ["Campaigns", total.campaigns],
              ["Sent", total.sent],
              ["Delivered", total.delivered],
              ["Opened", total.opened],
              ["Clicked", total.clicked],
              ["Bounced", total.bounced],
              ["Hard Bounced", data.hard_bounced],
              ["Unsubscribed", data.unsubscribed],
            ].map(([label, value]) => (
              <Card key={label}>
                <p className="text-navy-500 text-sm">{label}</p>
                <p className="text-3xl font-semibold mt-3">
                  {value.toLocaleString()}
                </p>
              </Card>
            ))}
          </div>
          <Card>
            <h2 className="font-semibold text-lg mb-4">Recent Campaigns</h2>
            {data.recent.map((row) => (
              <div
                key={row.id}
                className="py-4 border-t flex justify-between gap-4"
              >
                <div>
                  <Link
                    className="font-semibold text-blue-600"
                    to={`/admin/campaigns/${row.id}/report`}
                  >
                    {row.name}
                  </Link>
                  <p className="text-xs text-navy-500 mt-1">{row.subject}</p>
                </div>
                <p className="text-sm">
                  {row.sent} sent · {row.opened} opened · {row.clicked} clicked
                </p>
              </div>
            ))}
            {!data.recent.length && (
              <p className="text-sm text-navy-500">
                Your campaign results will appear here after sending.
              </p>
            )}
          </Card>
          <p className="text-xs text-navy-500 mt-5">
            Open and click statistics are estimates. Hard bounce and unsubscribe
            totals show the current suppression lists.
          </p>
        </>
      )}
    </div>
  );
}
