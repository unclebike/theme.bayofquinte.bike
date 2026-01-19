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

  const url = `${RWGPS_API_BASE}/routes/${routeId}.json`;

  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      'x-rwgps-api-key': apiKey,
      'x-rwgps-auth-token': authToken,
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
  // Process track points for map display
  const trackPoints = route.track_points || [];
  const simplified = simplifyTrackPoints(trackPoints, 150); // Max 150 points for performance
  const bounds = calculateBounds(simplified);

  return {
    id: route.id,
    name: route.name,
    url: `https://ridewithgps.com/routes/${route.id}`,
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
    // Track data for map
    trackPoints: simplified,
    bounds: bounds,
  };
}

/**
 * Simplify track points by sampling evenly
 * @param {Array} points - Array of track points
 * @param {number} maxPoints - Maximum number of points to return
 * @returns {Array} Simplified array of [lng, lat] coordinates
 */
function simplifyTrackPoints(points, maxPoints) {
  if (!points || points.length === 0) return [];
  if (points.length <= maxPoints) {
    return points.map(p => [p.x, p.y]);
  }

  // Sample evenly across the route
  const step = (points.length - 1) / (maxPoints - 1);
  const result = [];
  
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.round(i * step);
    const p = points[idx];
    result.push([p.x, p.y]);
  }
  
  return result;
}

/**
 * Calculate bounding box from track points
 * @param {Array} coordinates - Array of [lng, lat] coordinates
 * @returns {Array} [[minLng, minLat], [maxLng, maxLat]]
 */
function calculateBounds(coordinates) {
  if (!coordinates || coordinates.length === 0) {
    return null;
  }

  let minLng = Infinity, minLat = Infinity;
  let maxLng = -Infinity, maxLat = -Infinity;

  for (const [lng, lat] of coordinates) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  return [[minLng, minLat], [maxLng, maxLat]];
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

/**
 * Fetch all routes from the authenticated account's library
 * When authenticated as an organization, this returns the organization's routes
 * @param {object} env - Worker environment with secrets
 * @returns {Promise<Array>} Array of { id, name } objects
 */
export async function fetchClubRoutes(env) {
  const apiKey = env.RWGPS_API_KEY;
  const authToken = env.RWGPS_AUTH_TOKEN;

  const allRoutes = [];
  let page = 1;
  const pageSize = 200; // Max allowed by RWGPS API

  while (true) {
    // Use the authenticated user's routes endpoint
    // When logged in as an organization, this returns the org's routes
    const url = `${RWGPS_API_BASE}/routes.json?page=${page}&page_size=${pageSize}`;

    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'x-rwgps-api-key': apiKey,
        'x-rwgps-auth-token': authToken,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('RWGPS authentication failed');
      }
      throw new Error(`RWGPS API error: ${response.status}`);
    }

    const data = await response.json();
    const routes = data.routes || [];

    // Extract only id and name for each route
    for (const route of routes) {
      allRoutes.push({
        id: route.id,
        name: route.name,
      });
    }

    // Check if there are more pages
    const pagination = data.meta?.pagination;
    if (!pagination || !pagination.next_page_url || routes.length < pageSize) {
      break;
    }

    page++;
  }

  return allRoutes;
}
