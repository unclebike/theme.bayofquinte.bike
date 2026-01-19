/**
 * Cache Helpers for KV Storage
 * Implements stale-while-revalidate pattern with hash-based change detection
 */

// Cache TTL: 24 hours for stale data, revalidate in background
const CACHE_TTL_SECONDS = 86400; // 24 hours
const STALE_THRESHOLD_SECONDS = 3600; // 1 hour - check for updates after this

/**
 * Generate a hash of route data fields that trigger re-renders
 * Only distance and elevation_gain trigger changes (as specified)
 * @param {object} routeData - Normalized route data
 * @returns {string} Hash string
 */
export function generateDataHash(routeData) {
  const hashFields = {
    distance: routeData.distance,
    elevationGain: routeData.elevationGain,
  };
  // Simple hash: JSON string of relevant fields
  return btoa(JSON.stringify(hashFields)).slice(0, 16);
}

/**
 * Get cached route data from KV
 * @param {object} kv - KV namespace binding
 * @param {string} routeId - Route ID
 * @returns {Promise<object|null>} Cached data or null
 */
export async function getCachedRoute(kv, routeId) {
  const key = `route:${routeId}`;
  const cached = await kv.get(key, { type: 'json' });
  return cached;
}

/**
 * Store route data in KV cache
 * @param {object} kv - KV namespace binding
 * @param {string} routeId - Route ID
 * @param {object} routeData - Normalized route data
 * @param {object} renderedHtml - Map of star rating to rendered HTML
 * @returns {Promise<void>}
 */
export async function setCachedRoute(kv, routeId, routeData, renderedHtml) {
  const key = `route:${routeId}`;
  const cacheData = {
    dataHash: generateDataHash(routeData),
    lastFetched: new Date().toISOString(),
    routeData,
    renderedHtml,
  };

  await kv.put(key, JSON.stringify(cacheData), {
    expirationTtl: CACHE_TTL_SECONDS,
  });
}

/**
 * Check if cached data is stale and needs revalidation
 * @param {object} cached - Cached data object
 * @returns {boolean} True if stale
 */
export function isStale(cached) {
  if (!cached || !cached.lastFetched) return true;

  const lastFetched = new Date(cached.lastFetched);
  const now = new Date();
  const ageSeconds = (now - lastFetched) / 1000;

  return ageSeconds > STALE_THRESHOLD_SECONDS;
}

/**
 * Check if route data has changed (hash comparison)
 * @param {object} cached - Cached data object
 * @param {object} freshRouteData - Fresh route data from RWGPS
 * @returns {boolean} True if data has changed
 */
export function hasDataChanged(cached, freshRouteData) {
  if (!cached || !cached.dataHash) return true;
  
  const freshHash = generateDataHash(freshRouteData);
  return cached.dataHash !== freshHash;
}

/**
 * Generate a cache key for rendered HTML based on stars and level
 * @param {number|null} stars - Physical difficulty stars (1-5) or null
 * @param {string|null} level - Challenge level or null
 * @returns {string} Cache key
 */
function getHtmlCacheKey(stars, level) {
  const starsPart = stars !== null ? stars : 'none';
  const levelPart = level || 'none';
  return `stars_${starsPart}_level_${levelPart}`;
}

/**
 * Get rendered HTML for a specific stars/level combination from cache
 * @param {object} cached - Cached data object
 * @param {number|null} stars - Physical difficulty stars (1-5) or null
 * @param {string|null} level - Challenge level or null
 * @returns {string|null} Rendered HTML or null if not cached
 */
export function getCachedHtml(cached, stars, level) {
  if (!cached || !cached.renderedHtml) return null;
  const key = getHtmlCacheKey(stars, level);
  return cached.renderedHtml[key] || null;
}

/**
 * Update cache with new rendered HTML for a stars/level combination
 * @param {object} cached - Existing cached data
 * @param {number|null} stars - Physical difficulty stars (1-5) or null
 * @param {string|null} level - Challenge level or null
 * @param {string} html - Rendered HTML
 * @returns {object} Updated cache data
 */
export function updateCachedHtml(cached, stars, level, html) {
  const renderedHtml = cached.renderedHtml || {};
  const key = getHtmlCacheKey(stars, level);
  renderedHtml[key] = html;
  return {
    ...cached,
    renderedHtml,
  };
}

// Club routes cache TTL: 1 hour
const CLUB_ROUTES_TTL_SECONDS = 3600;

/**
 * Get cached club routes list from KV
 * @param {object} kv - KV namespace binding
 * @param {string} clubId - Club ID
 * @returns {Promise<Array|null>} Cached routes array or null
 */
export async function getCachedClubRoutes(kv, clubId) {
  const key = `club-routes:${clubId}`;
  const cached = await kv.get(key, { type: 'json' });
  return cached;
}

/**
 * Store club routes list in KV cache
 * @param {object} kv - KV namespace binding
 * @param {string} clubId - Club ID
 * @param {Array} routes - Array of { id, name } objects
 * @returns {Promise<void>}
 */
export async function setCachedClubRoutes(kv, clubId, routes) {
  const key = `club-routes:${clubId}`;
  await kv.put(key, JSON.stringify(routes), {
    expirationTtl: CLUB_ROUTES_TTL_SECONDS,
  });
}
