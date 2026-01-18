/**
 * GeoJSON utilities for route data
 */

/**
 * Convert track points to GeoJSON Feature
 * @param {Array} coordinates - Array of [lng, lat] coordinates
 * @param {object} properties - Additional properties to include
 * @returns {object} GeoJSON Feature
 */
export function toGeoJSONFeature(coordinates, properties = {}) {
  if (!coordinates || coordinates.length === 0) {
    return null;
  }

  return {
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: coordinates,
    },
    properties: properties,
  };
}

/**
 * Create a GeoJSON FeatureCollection
 * @param {Array} features - Array of GeoJSON features
 * @returns {object} GeoJSON FeatureCollection
 */
export function toFeatureCollection(features) {
  return {
    type: "FeatureCollection",
    features: features.filter(f => f !== null),
  };
}

/**
 * Generate GeoJSON data for a route
 * @param {object} routeData - Normalized route data with trackPoints
 * @returns {object} Object with geojson and bounds
 */
export function generateRouteGeoJSON(routeData) {
  const geojson = toGeoJSONFeature(routeData.trackPoints, {
    name: routeData.name,
    distance: routeData.distanceKm,
    elevation: routeData.elevationGain,
  });

  return {
    geojson: geojson,
    bounds: routeData.bounds,
    routeUrl: routeData.url,
  };
}
