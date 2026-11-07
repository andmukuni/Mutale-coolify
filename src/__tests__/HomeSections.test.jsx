import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Shield } from 'lucide-react';
import ExpertiseCard from '../components/ExpertiseCard';
import HomeAboutPreview from '../components/HomeAboutPreview';
import TrustedBySection from '../components/TrustedBySection';
import { defaultWebsitePages } from '../data/websitePages';

const SUMMARY = [
  'Quality management professional with 15+ years of experience.',
  'Demonstrated expertise in ISO-based quality management systems.',
  'Proven ability to lead cross-functional teams.',
  'A fourth line kept for the About page.',
];

// The partner strip as it was before the November redesigns (restored on 7 November).
describe('TrustedBySection', () => {
  it('shows the saved label and a card for each partner, four a row on wider screens', () => {
    const { container } = render(<TrustedBySection label="Mutale has worked with" legacyNames={['Africa CDC', 'WHO', 'HPCZ']} />);
    expect(screen.getByText('Mutale', { exact: false }).closest('p')).toHaveTextContent('Mutale has worked with');
    const grid = container.querySelector('.grid');
    expect(grid).toHaveClass('grid-cols-2', 'md:grid-cols-4');
    expect([...grid.children].map((card) => card.textContent)).toEqual(['Africa CDC', 'WHO', 'HPCZ']);
  });

  it('prefers uploaded logos, and shows the name if a logo fails to load', () => {
    render(<TrustedBySection label="Worked with" partners={[{ id: 1, name: 'WHO', logo_url: 'https://cdn.example.org/who.png' }]} legacyNames={['Ignored']} />);
    const logo = screen.getByRole('img', { name: 'WHO' });
    expect(screen.queryByText('Ignored')).not.toBeInTheDocument();
    fireEvent.error(logo);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('WHO')).toBeInTheDocument();
  });

  it('links a partner to its website in a new tab', () => {
    render(<TrustedBySection label="Worked with" partners={[{ id: 1, name: 'FIND', logo_url: '', website_url: 'https://www.finddx.org' }]} />);
    const link = screen.getByRole('link', { name: 'FIND' });
    expect(link).toHaveAttribute('href', 'https://www.finddx.org');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
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

describe('ExpertiseCard', () => {
  it('lights up on hover without lifting, as it is not a link', () => {
    const { container } = render(<ExpertiseCard icon={Shield} title="Quality Assurance" description="Audits and systems." />);
    const card = container.firstChild;
    expect(card.className).not.toMatch(/translate|shadow-xl/);
    expect(card).toHaveClass('group', 'hover:border-cyan-200');
    expect(screen.getByRole('heading', { level: 3, name: 'Quality Assurance' })).toBeInTheDocument();
    expect(container.querySelector('a, button')).toBeNull();
  });
});
