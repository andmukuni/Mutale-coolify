import { NavLink } from "react-router-dom";

const sections = [
  ["Dashboard", "/admin/campaigns/dashboard"],
  ["Campaigns", "/admin/campaigns"],
  ["Surveys", "/admin/campaigns/manage/surveys"],
  ["Subscription Lists", "/admin/campaigns/manage/subscriptions"],
  ["Suppression Lists", "/admin/campaigns/manage/suppressions"],
  ["Contacts", "/admin/campaigns/manage/contacts"],
  ["Templates", "/admin/campaigns/manage/templates"],
  ["Sender Settings", "/admin/campaigns/manage/senders"],
];
export default function CampaignWorkspaceNav() {
  return (
    <nav
      aria-label="Campaign workspace"
      className="flex overflow-x-auto gap-1 mb-5 border-b border-navy-100"
    >
      {sections.map(([name, to]) => (
        <NavLink
          key={to}
          end={to === "/admin/campaigns"}
          to={to}
          className={({ isActive }) =>
            `px-3 py-3 text-sm whitespace-nowrap border-b-2 ${isActive ? "border-blue-600 text-blue-600 font-semibold" : "border-transparent text-navy-500 hover:text-navy-900"}`
          }
        >
          {name}
        </NavLink>
      ))}
    </nav>
  );
}
