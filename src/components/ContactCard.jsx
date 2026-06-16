import { Mail, Phone, MapPin } from 'lucide-react';
import SiteLogo from './SiteLogo';

export default function ContactCard({ profile }) {
  return (
    <div className="bg-white rounded-2xl border border-navy-100 p-8 shadow-sm">
      <div className="flex items-center gap-4 mb-6">
        <SiteLogo variant="primary" className="h-16 w-auto shrink-0" />
        <div className="min-w-0">
          <h3 className="text-xl font-bold text-navy-900">{profile.name}</h3>
          <p className="text-sm text-navy-500">{profile.tagline}</p>
        </div>
      </div>

      <div className="space-y-4">
        <a
          href={`mailto:${profile.email}`}
          className="flex items-center gap-3 text-navy-600 hover:text-cyan-600 transition-colors group"
        >
          <div className="w-10 h-10 rounded-xl bg-cyan-50 text-cyan-600 flex items-center justify-center group-hover:bg-cyan-600 group-hover:text-white transition-colors">
            <Mail size={18} />
          </div>
          <div>
            <div className="text-xs text-navy-400">Email</div>
            <div className="text-sm font-medium">{profile.email}</div>
          </div>
        </a>

        <a
          href={`tel:${profile.phone}`}
          className="flex items-center gap-3 text-navy-600 hover:text-cyan-600 transition-colors group"
        >
          <div className="w-10 h-10 rounded-xl bg-cyan-50 text-cyan-600 flex items-center justify-center group-hover:bg-cyan-600 group-hover:text-white transition-colors">
            <Phone size={18} />
          </div>
          <div>
            <div className="text-xs text-navy-400">Phone</div>
            <div className="text-sm font-medium">{profile.phone}</div>
          </div>
        </a>

        <div className="flex items-center gap-3 text-navy-600">
          <div className="w-10 h-10 rounded-xl bg-cyan-50 text-cyan-600 flex items-center justify-center">
            <MapPin size={18} />
          </div>
          <div>
            <div className="text-xs text-navy-400">Location</div>
            <div className="text-sm font-medium">{profile.location}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
