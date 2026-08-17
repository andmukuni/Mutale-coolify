import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import EventVenueMap from '../components/EventVenueMap';

const event = {
  event_mode: 'in_person',
  venue: 'Mulungushi Conference Centre',
  location: 'Lusaka',
  location_place: 'Mulungushi International Conference Centre, Lusaka, Zambia',
  location_lat: -15.4167,
  location_lng: 28.2833,
};

describe('EventVenueMap', () => {
  it('lets attendees open the pin in Maps', () => {
    render(<EventVenueMap event={event} />);
    const link = screen.getByRole('link', { name: /open in maps/i });
    expect(link).toHaveAttribute('href', expect.stringContaining('google.com/maps'));
    expect(screen.getByTitle('Event venue map')).toHaveAttribute(
      'src',
      expect.stringContaining('openstreetmap.org'),
    );
  });

  it('hides the map for virtual events', () => {
    const { container } = render(<EventVenueMap event={{ ...event, event_mode: 'virtual' }} />);
    expect(container).toBeEmptyDOMElement();
  });
});
