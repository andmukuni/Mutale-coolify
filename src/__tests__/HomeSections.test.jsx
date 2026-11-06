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
  const cells = (list) => within(list).getAllByRole('listitem');

  it('heads one panel of partners with the saved label, a cell each', () => {
    render(<TrustedBySection label="Mutale has worked with" legacyNames={['Africa CDC', 'WHO', 'HPCZ']} />);
    const section = screen.getByRole('region', { name: 'Mutale has worked with' });
    expect(within(section).getByRole('heading', { level: 2, name: 'Mutale has worked with' })).toBeInTheDocument();
    const list = within(section).getByRole('list');
    // Two a row on phones, four from tablets, and one strip across the page from 1280 px.
    expect(list).toHaveClass('grid', 'grid-cols-2', 'md:grid-cols-4', 'xl:flex');
    // Without logos or websites, the name is the cell's large text.
    expect(cells(list).map((li) => li.textContent)).toEqual(['Africa CDC', 'WHO', 'HPCZ']);
  });

  it('wraps more than eight partners in fours instead of one strip', () => {
    render(<TrustedBySection label="Worked with" legacyNames={Array.from({ length: 10 }, (_, i) => `Partner ${i + 1}`)} />);
    expect(screen.getByRole('list')).not.toHaveClass('xl:flex');
  });

  it.each([
    [8, []],
    [7, ['block md:block']],
    [5, ['block md:block', 'hidden md:block', 'hidden md:block']],
    [6, ['hidden md:block', 'hidden md:block']],
  ])('completes the last row of %i partners with blank cells', (count, fillers) => {
    const { container } = render(<TrustedBySection label="Worked with" legacyNames={Array.from({ length: count }, (_, i) => `Partner ${i + 1}`)} />);
    const blanks = [...container.querySelectorAll('li[aria-hidden="true"]')];
    expect(blanks.map((li) => li.className.match(/(block|hidden) md:(block|hidden)/)[0])).toEqual(fillers);
    expect(blanks.every((li) => li.textContent === '')).toBe(true);
    // The single strip needs none.
    expect(blanks.every((li) => li.classList.contains('xl:hidden'))).toBe(true);
  });

  it('shows an uploaded logo on a plate with the name beneath, and the name alone if the logo fails', () => {
    const { container } = render(<TrustedBySection label="Worked with" partners={[{ id: 1, name: 'WHO', logo_url: 'https://cdn.example.org/who.png' }]} legacyNames={['Ignored']} />);
    const logo = container.querySelector('img');
    expect(logo).toHaveAttribute('src', 'https://cdn.example.org/who.png');
    // Decorative: the name is given as text.
    expect(logo).toHaveAttribute('alt', '');
    expect(screen.getByText('WHO')).toHaveClass('text-xs');
    expect(screen.queryByText('Ignored')).not.toBeInTheDocument();
    fireEvent.error(logo);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('WHO')).toHaveClass('font-bold');
  });

  it('links a partner to its website in a new tab, labelled with its domain, but only for web addresses', () => {
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
    expect(within(link).getByText('finddx.org')).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByText('Unsafe').closest('a')).toBeNull();
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
