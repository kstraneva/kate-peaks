import { elevationStats } from './stats.js';

const files = import.meta.glob('./data/*.json', { eager: true, import: 'default' });

const META = [
  { slug: 'camelback', name: 'Camelback Mountain', place: 'Phoenix, Arizona', date: '2025-04-25', kind: 'Trail run',
    note: 'A trail run up and over the mountain in the Phoenix desert.' },
  { slug: 'enchantments', name: 'The Enchantments', place: 'Alpine Lakes Wilderness, Washington', date: '2020-07-11', kind: 'Hike',
    note: 'A point-to-point day through the high alpine lakes basin, ending far below where it began.' },
  { slug: 'grand-canyon', name: 'South Kaibab to Bright Angel', place: 'Grand Canyon, Arizona', date: '2020-12-23', kind: 'Hike',
    note: 'Down to the Colorado River on South Kaibab, then back up Bright Angel to the South Rim.' },
  { slug: 'utah-trail-run', name: 'Wasatch Evening Run', place: 'Alta, Utah', date: '2025-07-09', kind: 'Trail run',
    note: 'An evening trail run in the Wasatch, topping out above 3,200 m.' },
];

export const PEAKS = META.map((m) => {
  const streams = files[`./data/${m.slug}.json`];
  const { gain, descent } = elevationStats(streams.altitude);
  return {
    ...m,
    streams,
    stats: {
      distance: streams.distance.at(-1),
      gain, descent,
      high: Math.max(...streams.altitude),
      low: Math.min(...streams.altitude),
    },
  };
});
