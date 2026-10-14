import { NavLink } from "react-router-dom";
import { tabClass } from "./campaignStyles";
import { TabIndicator } from "./CampaignTabBar";
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
      className="app-card mb-6 bg-white rounded-2xl border border-navy-100 shadow-sm px-1"
    >
      <div className="flex gap-1 overflow-x-auto">
        {sections.map(([name, to, Icon]) => (
          <NavLink
            key={to}
            end={to === "/admin/campaigns"}
            to={to}
            className={({ isActive }) => tabClass(isActive)}
          >
            {({ isActive }) => (
              <>
                <Icon size={16} />
                {name}
                <TabIndicator active={isActive} />
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
