/**
 * HTML Renderer for Route Stats Card
 * Generates HTML matching the Ghost theme's route-stats CSS classes
 */

import { calculateTechnicalDifficulty } from './calculator.js';

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
 * @returns {string} HTML for the list item
 */
function renderStatItem(label, value, isIconContainer = false) {
  if (isIconContainer) {
    return `
    <li class="list-item">
      <span class="list-label">${label}</span>
      <div class="icon-container">
        ${value}
      </div>
    </li>`;
  }
  return `
    <li class="list-item">
      <span class="list-label">${label}</span>
      <span class="list-value">${value}</span>
    </li>`;
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

  // Build the stats items
  const items = [
    renderStatItem('Challenge Level', challengeLevel),
    renderStatItem('Elevation Gain', formatElevation(routeData.elevationGain)),
    renderStatItem('Distance', formatDistance(routeData.distanceKm)),
    renderStatItem('Paved', formatPercentage(routeData.pavedPct)),
    renderStatItem('Unpaved', formatPercentage(routeData.unpavedPct)),
    renderStatItem(
      'Physical Difficulty',
      renderIcons(physicalDifficulty, 'donut', 'white-donut'),
      true
    ),
    renderStatItem(
      'Technical Difficulty',
      renderIcons(techDifficulty.score, 'pepper', 'white-pepper'),
      true
    ),
  ];

  // Wrap in the route-stats container
  return `<ul class="route-stats">${items.join('')}</ul>`;
}

/**
 * Render an error card when route data can't be fetched
 * @param {string} message - Error message to display
 * @returns {string} HTML for error state
 */
export function renderErrorCard(message) {
  return `
<ul class="route-stats">
  <li class="list-item">
    <span class="list-label">Error</span>
    <span class="list-value">${message}</span>
  </li>
</ul>`;
}

/**
 * Render a loading placeholder card
 * @returns {string} HTML for loading state
 */
export function renderLoadingCard() {
  return `
<ul class="route-stats">
  <li class="list-item">
    <span class="list-label">Loading</span>
    <span class="list-value">Fetching route data...</span>
  </li>
</ul>`;
}
