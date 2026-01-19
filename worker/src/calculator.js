/**
 * Technical Difficulty Calculator
 * 
 * Calculates technical difficulty (1-5 peppers) based on RWGPS fields:
 * - difficulty: casual, easy, moderate, hard, multi_day
 * - terrain: flat, rolling, climbing
 * - surface: paved, mostly_paved, mixed_surfaces, mostly_unpaved, unknown
 * - unpaved_pct: percentage of route that's unpaved
 * 
 * Key principle: Surface type determines caps, RWGPS difficulty/terrain 
 * determines base score. Paved roads are never technical regardless of steepness.
 */

/**
 * Base scores from RWGPS difficulty field
 */
const DIFFICULTY_BASE_SCORES = {
  'casual': 1,
  'easy': 2,
  'moderate': 3,
  'hard': 4,
  'multi_day': null, // Use terrain instead
};

/**
 * Terrain modifiers - climbing adds difficulty
 */
const TERRAIN_MODIFIERS = {
  'flat': 0,
  'rolling': 0,
  'climbing': 1,
  'unknown': 0,
};

/**
 * Get base score from RWGPS difficulty, falling back to terrain for multi_day
 * @param {string} difficulty - RWGPS difficulty field
 * @param {string} terrain - RWGPS terrain field
 * @returns {number} Base score 1-4
 */
function getBaseScore(difficulty, terrain) {
  const base = DIFFICULTY_BASE_SCORES[difficulty];
  
  if (base !== null && base !== undefined) {
    return base;
  }
  
  // For multi_day or unknown difficulty, derive from terrain
  if (terrain === 'climbing') return 3;
  if (terrain === 'rolling') return 2;
  return 2; // Default for flat or unknown
}

/**
 * Get terrain modifier
 * @param {string} terrain - RWGPS terrain field
 * @returns {number} Modifier to add to base score
 */
function getTerrainModifier(terrain) {
  return TERRAIN_MODIFIERS[terrain] || 0;
}

/**
 * Calculate unpaved distance in km
 * @param {number} distanceKm - Total distance in km
 * @param {number} unpavedPct - Percentage unpaved (can be -1 for unknown)
 * @returns {number} Unpaved distance in km
 */
function getUnpavedKm(distanceKm, unpavedPct) {
  if (unpavedPct < 0) return 0; // Unknown surface
  return (unpavedPct / 100) * distanceKm;
}

/**
 * Apply surface-based caps to the raw score
 * @param {number} rawScore - Calculated raw score
 * @param {string} surface - RWGPS surface field
 * @param {string} terrain - RWGPS terrain field
 * @param {string} difficulty - RWGPS difficulty field
 * @param {number} unpavedKm - Unpaved distance in km
 * @returns {number} Score with caps applied
 */
function applySurfaceCaps(rawScore, surface, terrain, difficulty, unpavedKm) {
  let score = rawScore;
  
  // Paved roads: always cap at 1 pepper
  if (surface === 'paved') {
    return Math.min(score, 1);
  }
  
  // Mostly paved: cap at 1 if < 1km unpaved, otherwise cap at 2
  if (surface === 'mostly_paved') {
    if (unpavedKm < 1) {
      return Math.min(score, 1);
    }
    return Math.min(score, 2);
  }
  
  // Mixed surfaces: cap at 2 if < 1km unpaved, cap at 3 unless climbing/hard
  if (surface === 'mixed_surfaces') {
    if (unpavedKm < 1) {
      return Math.min(score, 2);
    }
    // Uncapped if climbing or hard
    if (terrain === 'climbing' || difficulty === 'hard') {
      return score;
    }
    return Math.min(score, 3);
  }
  
  // Mostly unpaved: cap at 3 unless climbing or hard
  if (surface === 'mostly_unpaved') {
    if (terrain === 'climbing' || difficulty === 'hard') {
      return score; // Uncapped
    }
    return Math.min(score, 3);
  }
  
  // Unknown surface: minimum 3 peppers
  if (surface === 'unknown') {
    return Math.max(score, 3);
  }
  
  return score;
}

/**
 * Calculate technical difficulty score (1-5 peppers)
 * @param {object} routeData - Normalized route data from RWGPS
 * @returns {object} { score, baseScore, terrainModifier, surface, terrain, difficulty }
 */
export function calculateTechnicalDifficulty(routeData) {
  const { surface, terrain, difficulty, distanceKm, unpavedPct } = routeData;
  
  // Step 1: Get base score from RWGPS difficulty
  const baseScore = getBaseScore(difficulty, terrain);
  
  // Step 2: Get terrain modifier
  const terrainModifier = getTerrainModifier(terrain);
  
  // Step 3: Calculate raw score
  const rawScore = baseScore + terrainModifier;
  
  // Step 4: Calculate unpaved distance
  const unpavedKm = getUnpavedKm(distanceKm, unpavedPct);
  
  // Step 5: Apply surface caps
  const cappedScore = applySurfaceCaps(rawScore, surface, terrain, difficulty, unpavedKm);
  
  // Step 6: Clamp to 1-5
  const finalScore = Math.round(Math.min(5, Math.max(1, cappedScore)));
  
  return {
    score: finalScore,
    baseScore,
    terrainModifier,
    surface: surface || 'unknown',
    terrain: terrain || 'unknown',
    difficulty: difficulty || 'unknown',
    unpavedKm: Math.round(unpavedKm * 10) / 10,
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
