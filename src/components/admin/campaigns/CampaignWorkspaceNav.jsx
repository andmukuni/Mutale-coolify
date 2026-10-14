import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Megaphone,
  ClipboardList,
  BellRing,
  ShieldOff,
  Contact,
  ListChecks,
  BadgeCheck,
  CalendarCheck,
  LayoutTemplate,
  AtSign,
} from "lucide-react";

const sections = [
  ["Dashboard", "/admin/campaigns/dashboard", LayoutDashboard],
  ["Campaigns", "/admin/campaigns", Megaphone],
  ["Contacts", "/admin/campaigns/manage/contacts", Contact],
  ["Contact Lists", "/admin/campaigns/manage/groups", ListChecks],
  ["Subscription Lists", "/admin/campaigns/manage/subscriptions", BellRing],
  ["Suppression Lists", "/admin/campaigns/manage/suppressions", ShieldOff],
  ["Memberships", "/admin/campaigns/manage/memberships", BadgeCheck],
  ["Event Invitees", "/admin/campaigns/manage/events", CalendarCheck],
  ["Surveys", "/admin/campaigns/manage/surveys", ClipboardList],
  ["Templates", "/admin/campaigns/manage/templates", LayoutTemplate],
  ["Sender Settings", "/admin/campaigns/manage/senders", AtSign],
];

export default function CampaignWorkspaceNav() {
  return (
    <nav
      aria-label="Campaign workspace"
      className="flex overflow-x-auto gap-1 mb-6 border-b border-navy-100"
    >
      {sections.map(([name, to, Icon]) => (
        <NavLink
          key={to}
          end={to === "/admin/campaigns"}
          to={to}
          className={({ isActive }) =>
            `inline-flex items-center gap-2 px-3 py-3 -mb-px text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              isActive
                ? "border-cyan-600 text-cyan-700"
                : "border-transparent text-navy-500 hover:text-navy-800 hover:border-navy-200"
            }`
          }
        >
          <Icon size={15} />
          {name}
        </NavLink>
      ))}
    </nav>
  );
}
