import { Link } from 'react-router-dom';
import { Mail, Phone, MapPin } from 'lucide-react';
import { headerContact } from '../config/siteHeader.js';
import { useSiteMenu } from '../context/MenuContext';
import { useData } from '../context/DataContext';
import { defaultWebsitePages } from '../data/websitePages';
import SiteLogo from './SiteLogo';

function isExternalUrl(url) {
  return /^https?:\/\//i.test(String(url || ''));
}

function FooterLink({ link }) {
  const className = 'text-sm text-navy-400 hover:text-cyan-400 transition-colors';
  if (isExternalUrl(link.to) || link.openInNewTab) {
    return (
      <a href={link.to} target="_blank" rel="noreferrer noopener" className={className}>
        {link.label}
      </a>
    );
  }
  return (
    <Link to={link.to} className={className}>
      {link.label}
    </Link>
  );
}

export default function Footer() {
  const { footerLinks } = useSiteMenu();
  const { profile } = useData();
  const global = profile.websitePages?.global || defaultWebsitePages.global;
  const currentYear = new Date().getFullYear();

  return (
    <footer className="theme-fixed bg-navy-950 text-navy-300 border-t border-navy-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          {/* Brand */}
          <div>
            <Link to="/" className="flex items-center gap-3 mb-4 group">
              <SiteLogo variant="white" className="h-10 w-auto shrink-0 transition-opacity group-hover:opacity-90" />
              <span className="text-white font-semibold text-lg">{global.footerBrandName || defaultWebsitePages.global.footerBrandName}</span>
            </Link>
            <p className="text-sm text-navy-400 leading-relaxed">
              {global.footerBrandDescription || defaultWebsitePages.global.footerBrandDescription}
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-white font-semibold mb-4 text-sm uppercase tracking-wider">Quick Links</h4>
            <div className="grid grid-cols-2 gap-2">
              {footerLinks.map((link) => (
                <FooterLink key={`${link.to}-${link.label}`} link={link} />
              ))}
            </div>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-white font-semibold mb-4 text-sm uppercase tracking-wider">Contact</h4>
            <div className="space-y-3">
              <a href={headerContact.emailHref} className="flex items-center gap-2 text-sm text-navy-400 hover:text-cyan-400 transition-colors">
                <Mail size={15} />
                <span className="break-all">{headerContact.email}</span>
              </a>
              <a href={headerContact.phoneHref} className="flex items-center gap-2 text-sm text-navy-400 hover:text-cyan-400 transition-colors">
                <Phone size={15} />
                <span className="whitespace-nowrap">{headerContact.phone}</span>
              </a>
              <div className="flex items-center gap-2 text-sm text-navy-400">
                <MapPin size={15} />
                {headerContact.location}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-navy-800 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-xs text-navy-500">
            © {currentYear} {global.footerBrandName || defaultWebsitePages.global.footerBrandName}. All rights reserved.
          </p>
          <p className="text-xs text-navy-600 text-center sm:text-right">
            {global.footerTagline || defaultWebsitePages.global.footerTagline}
          </p>
        </div>
      </div>
    </footer>
  );
}
