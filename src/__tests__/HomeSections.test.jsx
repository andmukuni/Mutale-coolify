import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import HomeAboutPreview from '../components/HomeAboutPreview';
import TrustedBySection from '../components/TrustedBySection';
import { defaultWebsitePages } from '../data/websitePages';

const SUMMARY = [
  'Quality management professional with 15+ years of experience.',
  'Demonstrated expertise in ISO-based quality management systems.',
  'Proven ability to lead cross-functional teams.',
  'A fourth line kept for the About page.',
];

describe('TrustedBySection', () => {
  it('heads the partners with the saved label and lists each one, rows centred', () => {
    render(<TrustedBySection label="Mutale has worked with" legacyNames={['Africa CDC', 'WHO', 'HPCZ']} />);
    const section = screen.getByRole('region', { name: 'Mutale has worked with' });
    expect(within(section).getByRole('heading', { level: 2, name: 'Mutale has worked with' })).toBeInTheDocument();
    const list = within(section).getByRole('list');
    expect(list).toHaveClass('flex-wrap', 'justify-center');
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Africa CDC', 'WHO', 'HPCZ']);
  });

  it('prefers uploaded logos, and shows the name if a logo fails to load', () => {
    render(<TrustedBySection label="Worked with" partners={[{ id: 1, name: 'WHO', logo_url: 'https://cdn.example.org/who.png' }]} legacyNames={['Ignored']} />);
    const logo = screen.getByRole('img', { name: 'WHO' });
    expect(screen.queryByText('Ignored')).not.toBeInTheDocument();
    fireEvent.error(logo);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('WHO')).toBeInTheDocument();
  });

  it('links a partner to its website in a new tab, but only for web addresses', () => {
    render(
      <TrustedBySection
        label="Worked with"
        partners={[
          { id: 1, name: 'FIND', logo_url: '', website_url: 'https://www.finddx.org' },
          { id: 2, name: 'Unsafe', logo_url: '', website_url: 'javascript:alert(1)' },
        ]}
      />,
    );
    const link = screen.getByRole('link', { name: 'FIND (opens in a new tab)' });
    expect(link).toHaveAttribute('href', 'https://www.finddx.org/');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByText('Unsafe')).toBeInTheDocument();
  });

  it('shows nothing when there are no partners', () => {
    const { container } = render(<TrustedBySection label="Worked with" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('HomeAboutPreview', () => {
  const renderAbout = (page = defaultWebsitePages.home, summary = SUMMARY) => render(
    <MemoryRouter><HomeAboutPreview page={page} summary={summary} /></MemoryRouter>,
  );

  it('is headed by the saved eyebrow and title', () => {
    renderAbout();
    const section = screen.getByRole('region', { name: 'Driving Quality Excellence in Healthcare Diagnostics' });
    expect(within(section).getByText('About')).toBeInTheDocument();
    expect(within(section).getByRole('heading', { level: 2 })).toHaveTextContent('Driving Quality Excellence in Healthcare Diagnostics');
  });

  it('leads with the first line of the summary, then the next two as highlights', () => {
    renderAbout();
    expect(screen.getByText(SUMMARY[0])).toHaveClass('text-lg');
    const lists = screen.getAllByRole('list');
    expect(within(lists[0]).getAllByRole('listitem').map((li) => li.textContent)).toEqual([SUMMARY[1], SUMMARY[2]]);
    expect(screen.queryByText(SUMMARY[3])).not.toBeInTheDocument();
  });

  it('lists the standards, shows the credential card, and leads to the full profile', () => {
    renderAbout();
    const tags = screen.getByRole('list', { name: 'Standards and frameworks' });
    expect(within(tags).getAllByRole('listitem').map((li) => li.textContent)).toEqual(defaultWebsitePages.home.aboutTags);
    expect(screen.getByText('ISO Expert')).toBeInTheDocument();
    expect(screen.getByText('15189 · 9001 · 17025')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Read Full Profile' })).toHaveAttribute('href', '/about');
    expect(screen.getByRole('link', { name: 'View Experience' })).toHaveAttribute('href', '/experience');
  });

  it('falls back to the default copy and image for anything left blank', () => {
    renderAbout({ aboutTitle: '  ', aboutEyebrow: '', aboutImage: '' }, []);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(defaultWebsitePages.home.aboutTitle);
    expect(screen.getByText('About')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Laboratory quality assurance work' }).getAttribute('src')).toMatch(/^https:\/\/images\.unsplash\.com\//);
    // No summary: no lead and no highlights, rather than empty markup.
    expect(screen.getAllByRole('list')).toHaveLength(1);
  });

  it('uses the image saved in Sections', () => {
    renderAbout({ ...defaultWebsitePages.home, aboutImage: 'https://cdn.example.org/mutale-lab.jpg' });
    expect(screen.getByRole('img', { name: 'Laboratory quality assurance work' })).toHaveAttribute('src', 'https://cdn.example.org/mutale-lab.jpg');
  });
});
