/**
 * HTML Renderer for Route Stats Card
 * Generates HTML matching the Ghost theme's route-stats CSS classes
 */

import { calculateTechnicalDifficulty } from './calculator.js';
import { generateRouteGeoJSON } from './geojson.js';

/**
 * Generate icon HTML for difficulty ratings
 * @param {number} filled - Number of filled icons (1-5)
 * @param {string} filledClass - CSS class for filled icons
 * @param {string} emptyClass - CSS class for empty icons
 * @param {number} total - Total number of icons (default 5)
 * @returns {string} HTML string with icon spans
 */
function renderIcons(filled, filledClass, emptyClass, total = 5) {
  let html = '';
  for (let i = 0; i < total; i++) {
    if (i < filled) {
      html += `<span class="${filledClass}"></span>`;
    } else {
      html += `<span class="${emptyClass}"></span>`;
    }
  }
  return html;
}

/**
 * Format distance for display
 * @param {number} distanceKm - Distance in kilometers
 * @returns {string} Formatted distance string
 */
function formatDistance(distanceKm) {
  return `${distanceKm.toFixed(1)}km`;
}

/**
 * Format elevation for display
 * @param {number} elevationM - Elevation in meters
 * @returns {string} Formatted elevation string
 */
function formatElevation(elevationM) {
  return `${Math.round(elevationM)}m`;
}

/**
 * Format percentage for display
 * @param {number} pct - Percentage value
 * @returns {string} Formatted percentage string
 */
function formatPercentage(pct) {
  return `${Math.round(pct)}%`;
}

/**
 * Render a single stat item
 * @param {string} label - Item label
 * @param {string} value - Item value (can be HTML)
 * @param {boolean} isIconContainer - Whether value contains icons
 * @param {string} extraClass - Additional CSS class for the item
 * @returns {string} HTML for the list item
 */
function renderStatItem(label, value, isIconContainer = false, extraClass = '') {
  const classAttr = extraClass ? `list-item ${extraClass}` : 'list-item';
  if (isIconContainer) {
    return `
    <div class="${classAttr}">
      <span class="list-label">${label}</span>
      <div class="icon-container">
        ${value}
      </div>
    </div>`;
  }
  return `
    <div class="${classAttr}">
      <span class="list-label">${label}</span>
      <span class="list-value">${value}</span>
    </div>`;
}

/**
 * Render the route map container
 * @param {object} routeData - Normalized route data with trackPoints and bounds
 * @returns {string} HTML for the map container
 */
function renderMapContainer(routeData) {
  if (!routeData.trackPoints || routeData.trackPoints.length === 0) {
    return '';
  }

  const geoData = generateRouteGeoJSON(routeData);
  
  // Escape JSON for HTML attribute
  const geojsonAttr = JSON.stringify(geoData.geojson).replace(/"/g, '&quot;');
  const boundsAttr = JSON.stringify(geoData.bounds).replace(/"/g, '&quot;');

  return `
    <div class="route-map-item">
      <div class="route-map" 
           data-geojson="${geojsonAttr}"
           data-bounds="${boundsAttr}"
           data-route-url="${geoData.routeUrl}">
      </div>
    </div>`;
}

/**
 * Render the complete route stats card HTML
 * @param {object} options - Rendering options
 * @param {object} options.routeData - Normalized RWGPS route data
 * @param {number} options.physicalDifficulty - Physical difficulty (1-5) from Ghost stars
 * @param {string} options.challengeLevel - Challenge level text from Ghost
 * @returns {string} Complete HTML for route stats card
 */
export function renderRouteStatsCard({ routeData, physicalDifficulty, challengeLevel }) {
  // Calculate technical difficulty from route data
  const techDifficulty = calculateTechnicalDifficulty(routeData);

  // Build the map container
  const mapHtml = renderMapContainer(routeData);
  
  // Build the stats items - challenge level spans full width, others in 2-col grid
  const statsItems = [];
  
  // Only include challenge level if provided
  if (challengeLevel) {
    statsItems.push(renderStatItem('Challenge Level', challengeLevel, false, 'challenge-level'));
  }
  
  // Always include core stats
  statsItems.push(
    renderStatItem('Elevation Gain', formatElevation(routeData.elevationGain)),
    renderStatItem('Distance', formatDistance(routeData.distanceKm)),
    renderStatItem('Paved', formatPercentage(routeData.pavedPct)),
    renderStatItem('Unpaved', formatPercentage(routeData.unpavedPct)),
  );
  
  // Only include physical difficulty if provided
  if (physicalDifficulty) {
    statsItems.push(
      renderStatItem(
        'Physical Difficulty',
        renderIcons(physicalDifficulty, 'donut', 'white-donut'),
        true
      )
    );
  }
  
  // Always include technical difficulty (auto-calculated)
  statsItems.push(
    renderStatItem(
      'Technical Difficulty',
      renderIcons(techDifficulty.score, 'pepper', 'white-pepper'),
      true
    )
  );

  // Wrap in the route-stats container: map on left, stats grid on right
  return `<div class="route-stats">${mapHtml}<div class="route-stats-grid">${statsItems.join('')}</div></div>`;
}

/**
 * Render an error card when route data can't be fetched
 * @param {string} message - Error message to display
 * @returns {string} HTML for error state
 */
export function renderErrorCard(message) {
  return `
<div class="route-stats">
  <div class="route-stats-grid">
    <div class="list-item challenge-level">
      <span class="list-label">Error</span>
      <span class="list-value">${message}</span>
    </div>
  </div>
</div>`;
}

/**
 * Render a loading placeholder card
 * @returns {string} HTML for loading state
 */
export function renderLoadingCard() {
  return `
<div class="route-stats">
  <div class="route-stats-grid">
    <div class="list-item challenge-level">
      <span class="list-label">Loading</span>
      <span class="list-value">Fetching route data...</span>
    </div>
  </div>
</div>`;
}
