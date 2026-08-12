// Printing price ESTIMATOR — reference ranges only, not a fixed price list.
// Historical Chance Publishers pricing data informed these bands, but real
// jobs always get a formal supplier-backed quotation (see PrintJob). Admin
// should refine these bands over time as more supplier quotes come in;
// nothing here is hard-coded into a "final price" anywhere in the system.

export interface EstimateInput {
  bookSize: 'A4' | 'B5' | 'A5' | 'A6' | '6x9' | 'custom';
  quantity: number;
  coverType: 'SOFTCOVER' | 'HARDCOVER';
}

interface Range {
  low: number;
  high: number;
}

// Per-copy KSh ranges by book size, banded by quantity. Approximate,
// standard-spec softcover. Hardcover and premium finishing push toward (or
// above) the high end — see the hardcover multiplier below.
const QUANTITY_BANDS = [20, 50, 100, 200, 250, 500, 1000] as const;

const PER_COPY_RANGES: Record<EstimateInput['bookSize'], Record<(typeof QUANTITY_BANDS)[number], Range>> = {
  A5: {
    20: { low: 600, high: 800 }, 50: { low: 700, high: 1000 }, 100: { low: 280, high: 430 },
    200: { low: 300, high: 400 }, 250: { low: 300, high: 525 }, 500: { low: 180, high: 330 }, 1000: { low: 120, high: 340 },
  },
  B5: {
    20: { low: 650, high: 850 }, 50: { low: 750, high: 1050 }, 100: { low: 300, high: 450 },
    200: { low: 280, high: 420 }, 250: { low: 280, high: 450 }, 500: { low: 250, high: 350 }, 1000: { low: 250, high: 300 },
  },
  A4: {
    20: { low: 700, high: 900 }, 50: { low: 800, high: 1100 }, 100: { low: 400, high: 800 },
    200: { low: 300, high: 600 }, 250: { low: 300, high: 600 }, 500: { low: 220, high: 450 }, 1000: { low: 180, high: 400 },
  },
  '6x9': {
    20: { low: 650, high: 850 }, 50: { low: 750, high: 1050 }, 100: { low: 450, high: 650 },
    200: { low: 380, high: 550 }, 250: { low: 380, high: 550 }, 500: { low: 350, high: 500 }, 1000: { low: 280, high: 430 },
  },
  A6: {
    20: { low: 500, high: 700 }, 50: { low: 600, high: 900 }, 100: { low: 250, high: 400 },
    200: { low: 220, high: 380 }, 250: { low: 220, high: 380 }, 500: { low: 160, high: 300 }, 1000: { low: 110, high: 300 },
  },
  custom: {
    20: { low: 600, high: 900 }, 50: { low: 700, high: 1050 }, 100: { low: 300, high: 700 },
    200: { low: 280, high: 550 }, 250: { low: 280, high: 550 }, 500: { low: 200, high: 450 }, 1000: { low: 150, high: 400 },
  },
};

const HARDCOVER_MULTIPLIER = { low: 1.4, high: 2.0 };

function nearestBand(quantity: number): (typeof QUANTITY_BANDS)[number] {
  return QUANTITY_BANDS.reduce((closest, band) => (Math.abs(band - quantity) < Math.abs(closest - quantity) ? band : closest));
}

export function estimatePrintingRange(input: EstimateInput): { lowKes: number; highKes: number } {
  const band = nearestBand(input.quantity);
  const perCopy = PER_COPY_RANGES[input.bookSize][band];

  let low = perCopy.low;
  let high = perCopy.high;
  if (input.coverType === 'HARDCOVER') {
    low = Math.round(low * HARDCOVER_MULTIPLIER.low);
    high = Math.round(high * HARDCOVER_MULTIPLIER.high);
  }

  return { lowKes: low * input.quantity, highKes: high * input.quantity };
}
