/**
 * Technical Difficulty Calculator
 * 
 * Calculates technical difficulty (1-5 peppers) based on:
 * - Terrain base score (from RWGPS surface field)
 * - Elevation multiplier (from elevation gain per km)
 * 
 * Key principle: Elevation amplifies technical difficulty, it doesn't create it.
 * Steep pavement stays non-technical. Steep loose gravel becomes very technical.
 */

/**
 * Terrain base scores mapped from RWGPS surface field
 * These represent the inherent technical challenge of each surface type
 */
const TERRAIN_BASE_SCORES = {
  'paved': 1.0,           // Smooth pavement / chipseal
  'mostly_paved': 1.5,    // Mostly paved with some gravel
  'mixed_surfaces': 2.5,  // Mix of paved and unpaved
  'mostly_unpaved': 3.5,  // Mostly gravel/dirt
  'unknown': 2.0,         // Default to moderate
};

/**
 * Elevation stress bands and their multipliers
 * These amplify the base terrain score
 */
const ELEVATION_BANDS = [
  { maxRatio: 3, stress: 'low', multiplier: 1.0 },
  { maxRatio: 6, stress: 'moderate', multiplier: 1.1 },
  { maxRatio: 9, stress: 'high', multiplier: 1.25 },
  { maxRatio: Infinity, stress: 'severe', multiplier: 1.4 },
];

/**
 * Get terrain base score from RWGPS surface type
 * @param {string} surface - RWGPS surface field value
 * @returns {number} Base score 1-5
 */
function getTerrainBaseScore(surface) {
  return TERRAIN_BASE_SCORES[surface] || TERRAIN_BASE_SCORES['unknown'];
}

/**
 * Calculate elevation gain ratio (meters per km)
 * @param {number} elevationGain - Total elevation gain in meters
 * @param {number} distanceKm - Total distance in kilometers
 * @returns {number} Elevation gain per km
 */
function getElevationRatio(elevationGain, distanceKm) {
  if (distanceKm <= 0) return 0;
  return elevationGain / distanceKm;
}

/**
 * Get elevation multiplier based on gain ratio
 * @param {number} gainRatio - Elevation gain per km (m/km)
 * @returns {object} { stress, multiplier }
 */
function getElevationMultiplier(gainRatio) {
  for (const band of ELEVATION_BANDS) {
    if (gainRatio < band.maxRatio) {
      return { stress: band.stress, multiplier: band.multiplier };
    }
  }
  return { stress: 'severe', multiplier: 1.4 };
}

/**
 * Apply sanity overrides to prevent nonsense outputs
 * @param {number} rawScore - Calculated raw technical score
 * @param {string} surface - RWGPS surface type
 * @param {number} terrainBase - Terrain base score
 * @param {number} gainRatio - Elevation gain per km
 * @returns {number} Adjusted score with overrides applied
 */
function applySanityOverrides(rawScore, surface, terrainBase, gainRatio) {
  let score = rawScore;

  // Override 1: If terrain base >= 4, final tech cannot be < 3
  if (terrainBase >= 4 && score < 3) {
    score = 3;
  }

  // Override 2: If mostly_unpaved + gain >= 6 m/km, final tech >= 4
  if (surface === 'mostly_unpaved' && gainRatio >= 6 && score < 4) {
    score = 4;
  }

  // Override 3: If paved or mostly_paved (>=80% paved), final tech <= 2
  if ((surface === 'paved' || surface === 'mostly_paved') && score > 2) {
    score = 2;
  }

  return score;
}

/**
 * Calculate technical difficulty score (1-5)
 * @param {object} routeData - Normalized route data from RWGPS
 * @returns {object} { score, terrainBase, elevationRatio, elevationStress, rawScore }
 */
export function calculateTechnicalDifficulty(routeData) {
  const { surface, elevationGain, distanceKm } = routeData;

  // Step 1: Get terrain base score
  const terrainBase = getTerrainBaseScore(surface);

  // Step 2: Calculate elevation ratio
  const elevationRatio = getElevationRatio(elevationGain, distanceKm);

  // Step 3: Get elevation multiplier
  const { stress: elevationStress, multiplier } = getElevationMultiplier(elevationRatio);

  // Step 4: Calculate raw score
  const rawScore = terrainBase * multiplier;

  // Step 5: Apply sanity overrides
  const adjustedScore = applySanityOverrides(rawScore, surface, terrainBase, elevationRatio);

  // Step 6: Clamp and round to 1-5
  const finalScore = Math.round(Math.min(5, Math.max(1, adjustedScore)));

  return {
    score: finalScore,
    terrainBase,
    elevationRatio: Math.round(elevationRatio * 10) / 10, // Round to 1 decimal
    elevationStress,
    rawScore: Math.round(rawScore * 100) / 100,
  };
}

/**
 * Get difficulty label from score
 * @param {number} score - Technical difficulty score 1-5
 * @returns {string} Human-readable label
 */
export function getDifficultyLabel(score) {
  const labels = {
    1: 'Easy',
    2: 'Moderate',
    3: 'Challenging',
    4: 'Difficult',
    5: 'Expert',
  };
  return labels[score] || 'Unknown';
}
