'use strict';

const { BED_STATUS } = require('../../utils/constants');
const { rate } = require('./buckets');

// Folds the per-ward aggregation into totals plus a per-ward breakdown.
function shapeOccupancy(rows = []) {
  let total = 0;
  let occupied = 0;
  let available = 0;

  const wards = rows.map((row) => {
    const byStatus = {};
    for (const entry of row.byStatus || []) byStatus[entry.status] = entry.count;

    const wardOccupied = byStatus[BED_STATUS.OCCUPIED] || 0;
    const wardAvailable = byStatus[BED_STATUS.AVAILABLE] || 0;

    total += row.total;
    occupied += wardOccupied;
    available += wardAvailable;

    return {
      ward: row.ward,
      total: row.total,
      occupied: wardOccupied,
      available: wardAvailable,
      byStatus,
      occupancyRate: rate(wardOccupied, row.total),
    };
  });

  return { total, occupied, available, occupancyRate: rate(occupied, total), wards };
}

module.exports = { shapeOccupancy };
