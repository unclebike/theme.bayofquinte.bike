/**
 * RWGPS API Client
 * Fetches route data from RideWithGPS API
 */

const RWGPS_API_BASE = 'https://ridewithgps.com/api/v1';

/**
 * Fetch route data from RWGPS API
 * @param {string} routeId - The RWGPS route ID
 * @param {object} env - Worker environment with secrets
 * @returns {Promise<object>} Route data
 */
export async function fetchRouteData(routeId, env) {
  const apiKey = env.RWGPS_API_KEY;
  const authToken = env.RWGPS_AUTH_TOKEN;

  const url = new URL(`${RWGPS_API_BASE}/routes/${routeId}.json`);
  url.searchParams.set('apikey', apiKey);
  url.searchParams.set('auth_token', authToken);

  const response = await fetch(url.toString(), {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Route ${routeId} not found`);
    }
    if (response.status === 401) {
      throw new Error('RWGPS authentication failed');
    }
    throw new Error(`RWGPS API error: ${response.status}`);
  }

  const data = await response.json();
  return normalizeRouteData(data.route);
}

/**
 * Normalize RWGPS route data to our internal format
 * @param {object} route - Raw RWGPS route object
 * @returns {object} Normalized route data
 */
function normalizeRouteData(route) {
  return {
    id: route.id,
    name: route.name,
    // Distance in meters, convert to km
    distance: route.distance,
    distanceKm: route.distance / 1000,
    // Elevation in meters
    elevationGain: route.elevation_gain,
    elevationLoss: route.elevation_loss,
    // Surface data
    unpavedPct: route.unpaved_pct || 0,
    pavedPct: 100 - (route.unpaved_pct || 0),
    surface: route.surface || 'unknown',
    // Terrain and difficulty from RWGPS
    terrain: route.terrain || 'unknown',
    difficulty: route.difficulty || 'unknown',
    // Track type
    trackType: route.track_type || 'unknown',
    // Timestamps for cache invalidation
    createdAt: route.created_at,
    updatedAt: route.updated_at,
  };
}

/**
 * Extract route ID from RWGPS URL
 * @param {string} url - Full RWGPS URL
 * @returns {string|null} Route ID or null if not found
 */
export function extractRouteId(url) {
  const match = url.match(/ridewithgps\.com\/routes\/(\d+)/);
  return match ? match[1] : null;
}
