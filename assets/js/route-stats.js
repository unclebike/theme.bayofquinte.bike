/**
 * Route Stats Client-Side Script
 * 
 * Finds Ghost button cards with RideWithGPS URLs and replaces them
 * with route stats cards fetched from the Cloudflare Worker.
 * 
 * - Donut count (physical difficulty) is extracted from 🍩 emojis in button text
 * - Challenge level is extracted from post tags (Rambler, Explorer, Adventurer, Epic)
 * - Technical difficulty (peppers) is auto-calculated by the worker
 * 
 * Uses localStorage for hash-based change detection and silent updates.
 * Implements lazy loading - Mapbox JS is only loaded when map scrolls into view.
 */

(function() {
  'use strict';

  // Configuration
  const WORKER_BASE_PRIMARY = 'https://api.bayofquinte.bike';
  const WORKER_BASE_FALLBACK = 'https://rwgps-route-stats.adam-7e5.workers.dev';
  const STORAGE_PREFIX = 'route-stats-hash:';
  
  // Mapbox configuration
  const MAPBOX_JS_URL = 'https://api.mapbox.com/mapbox-gl-js/v3.0.1/mapbox-gl.js';
  const MAPBOX_TOKEN = 'pk.eyJ1IjoidGlsbGV5IiwiYSI6IlFhX1ZUYm8ifQ.Dr4lrivYwl5ZTnuAdMqzVg';
  const MAPBOX_STYLE = 'mapbox://styles/tilley/cl0sia1dj000u14nmil6oqaox?v=2';
  const ROUTE_LINE_COLOR = 'hsl(8, 75%, 60%)';
  const ROUTE_LINE_WIDTH = 4;

  // State
  let mapObserver = null;
  let mapboxLoading = false;
  let mapboxLoaded = false;
  let pendingMapContainers = [];

  /**
   * Dynamically load Mapbox GL JS
   * @returns {Promise} Resolves when Mapbox is loaded
   */
  function loadMapboxJS() {
    // Already loaded
    if (mapboxLoaded || typeof mapboxgl !== 'undefined') {
      mapboxLoaded = true;
      return Promise.resolve();
    }

    // Already loading, return existing promise
    if (mapboxLoading) {
      return new Promise((resolve) => {
        const check = setInterval(() => {
          if (mapboxLoaded) {
            clearInterval(check);
            resolve();
          }
        }, 50);
      });
    }

    // Start loading
    mapboxLoading = true;

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = MAPBOX_JS_URL;
      script.async = true;
      
      script.onload = () => {
        mapboxLoaded = true;
        mapboxLoading = false;
        resolve();
      };
      
      script.onerror = () => {
        mapboxLoading = false;
        reject(new Error('Failed to load Mapbox GL JS'));
      };
      
      document.head.appendChild(script);
    });
  }

  /**
   * Extract route ID from RWGPS URL
   * @param {string} url - Full RWGPS URL
   * @returns {string|null} Route ID or null
   */
  function extractRouteId(url) {
    const match = url.match(/ridewithgps\.com\/routes\/(\d+)/);
    return match ? match[1] : null;
  }

  /**
   * Count donut emojis in button text for physical difficulty
   * @param {Element} button - Button/link element
   * @returns {number|null} Number of donut emojis (1-5) or null if none found
   */
  function countDonuts(button) {
    const text = button.textContent || '';
    const donutMatches = text.match(/🍩/g);
    if (!donutMatches || donutMatches.length === 0) {
      return null;
    }
    // Clamp to 1-5 range
    return Math.min(Math.max(donutMatches.length, 1), 5);
  }

  /**
   * Get challenge level from post tags
   * Looks for Rambler, Explorer, Adventurer, or Epic tags
   * @returns {string|null} Challenge level or null if not found
   */
  function getChallengeLevelFromTags() {
    const validLevels = ['Rambler', 'Explorer', 'Adventurer', 'Epic'];
    
    // Look for tags in the post-tags container
    const tagContainer = document.querySelector('.post-tags');
    if (!tagContainer) return null;
    
    const tagLinks = tagContainer.querySelectorAll('a');
    for (const link of tagLinks) {
      const tagText = link.textContent.trim();
      // Check if the tag matches any valid level (case-insensitive)
      const matchedLevel = validLevels.find(
        level => level.toLowerCase() === tagText.toLowerCase()
      );
      if (matchedLevel) {
        return matchedLevel;
      }
    }
    
    return null;
  }

  /**
   * Get stored hash from localStorage
   * @param {string} routeId - Route ID
   * @returns {string|null} Stored hash or null
   */
  function getStoredHash(routeId) {
    try {
      return localStorage.getItem(STORAGE_PREFIX + routeId);
    } catch (e) {
      return null;
    }
  }

  /**
   * Store hash in localStorage
   * @param {string} routeId - Route ID
   * @param {string} hash - Data hash
   */
  function storeHash(routeId, hash) {
    try {
      localStorage.setItem(STORAGE_PREFIX + routeId, hash);
    } catch (e) {
      // localStorage not available, ignore
    }
  }

  /**
   * Fetch from worker with fallback
   * @param {string} endpoint - Endpoint path (e.g., '/route-stats' or '/club-routes')
   * @param {URLSearchParams} params - Query parameters
   * @returns {Promise<Response>} Fetch response
   */
  async function fetchFromWorker(endpoint, params = new URLSearchParams()) {
    const paramString = params.toString();
    const suffix = paramString ? `?${paramString}` : '';

    try {
      const response = await fetch(`${WORKER_BASE_PRIMARY}${endpoint}${suffix}`);
      if (response.ok) return response;
      // Primary returned error, try fallback
      return fetch(`${WORKER_BASE_FALLBACK}${endpoint}${suffix}`);
    } catch (e) {
      // Primary failed (DNS not ready), try fallback
      return fetch(`${WORKER_BASE_FALLBACK}${endpoint}${suffix}`);
    }
  }

  /**
   * Fetch route stats from worker and replace element
   * @param {Element} targetElement - Element to replace with route stats
   * @param {string} routeId - RWGPS route ID
   * @param {number|null} donuts - Physical difficulty (1-5) or null
   * @param {string|null} level - Challenge level text or null
   * @param {boolean} insertInto - If true, insert into element instead of replacing
   */
  async function loadRouteStats(targetElement, routeId, donuts, level, insertInto = false) {
    const params = new URLSearchParams();
    params.set('id', routeId);
    if (donuts !== null) {
      params.set('stars', donuts);
    }
    if (level !== null) {
      params.set('level', level);
    }

    try {
      const response = await fetchFromWorker('/route-stats', params);
      
      if (!response.ok) {
        console.error(`Route stats fetch failed: ${response.status}`);
        return;
      }

      const html = await response.text();
      const newHash = response.headers.get('X-Data-Hash');
      const storedHash = getStoredHash(routeId);

      // Check if we need to update
      // Always update on first load or if hash changed
      if (!storedHash || storedHash !== newHash || !targetElement.dataset.routeStatsLoaded) {
        // Create a temporary container to parse the HTML
        const temp = document.createElement('div');
        temp.innerHTML = html;
        const routeStatsElement = temp.firstElementChild;

        if (routeStatsElement) {
          if (insertInto) {
            // Insert into the placeholder element
            targetElement.appendChild(routeStatsElement);
          } else {
            // Replace the element with route stats
            targetElement.replaceWith(routeStatsElement);
          }
          
          // Store the new hash
          if (newHash) {
            storeHash(routeId, newHash);
          }

          // Set up lazy loading for the map in the new element
          const mapContainer = routeStatsElement.querySelector('.route-map');
          if (mapContainer) {
            setupLazyMap(mapContainer);
          }
        }
      }
    } catch (error) {
      console.error(`Failed to load route stats for route ${routeId}:`, error);
    }
  }

  /**
   * Find and process all button cards with RWGPS URLs
   * @returns {number} Number of button cards processed
   */
  function processButtonCards() {
    // Find all button cards
    const buttonCards = document.querySelectorAll('.kg-button-card');

    // Get challenge level from post tags once (shared across all cards on the page)
    const level = getChallengeLevelFromTags();
    let processedCount = 0;

    buttonCards.forEach(card => {
      // Skip already processed cards
      if (card.dataset.routeStatsProcessed) return;
      card.dataset.routeStatsProcessed = 'true';

      // Find button/link with RWGPS URL
      const button = card.querySelector('a[href*="ridewithgps.com/routes"]');
      if (!button) return;

      const routeId = extractRouteId(button.href);
      if (!routeId) return;

      // Extract donut count from button text
      const donuts = countDonuts(button);

      // Load and replace
      loadRouteStats(card, routeId, donuts, level);
      processedCount++;
    });

    return processedCount;
  }

  /**
   * Normalize a string for fuzzy matching
   * @param {string} str - Input string
   * @returns {string} Normalized string
   */
  function normalizeForMatch(str) {
    return str
      .toLowerCase()
      .trim()
      .replace(/^the\s+/i, '')       // Remove leading "the "
      .replace(/\s+route$/i, '')     // Remove trailing " route"
      .replace(/\s+loop$/i, '')      // Remove trailing " loop"
      .replace(/[^\w\s]/g, '')       // Remove special characters
      .replace(/\s+/g, ' ');         // Normalize whitespace
  }

  /**
   * Find a matching route from the club routes list
   * Uses medium-strictness fuzzy matching
   * @param {string} postTitle - The post title to match
   * @param {Array} clubRoutes - Array of { id, name } objects
   * @returns {object|null} Matching route or null
   */
  function findMatchingRoute(postTitle, clubRoutes) {
    const normalizedTitle = normalizeForMatch(postTitle);
    
    for (const route of clubRoutes) {
      const normalizedName = normalizeForMatch(route.name);
      
      // Exact match after normalization
      if (normalizedTitle === normalizedName) {
        return route;
      }
      
      // One contains the other (medium strictness)
      if (normalizedTitle.includes(normalizedName) || 
          normalizedName.includes(normalizedTitle)) {
        return route;
      }
    }
    
    return null;
  }

  /**
   * Check if we're on a route page (has the placeholder element)
   * @returns {boolean}
   */
  function isRoutePage() {
    return document.querySelector('.route-stats-placeholder') !== null;
  }

  /**
   * Get the post title from the page
   * @returns {string|null}
   */
  function getPostTitle() {
    const titleElement = document.querySelector('.post-title');
    return titleElement ? titleElement.textContent.trim() : null;
  }

  /**
   * Fetch club routes from worker
   * @returns {Promise<Array|null>} Array of { id, name } or null on error
   */
  async function fetchClubRoutes() {
    try {
      const response = await fetchFromWorker('/club-routes');
      if (!response.ok) {
        console.error(`Club routes fetch failed: ${response.status}`);
        return null;
      }
      const data = await response.json();
      return data.routes || null;
    } catch (error) {
      console.error('Failed to fetch club routes:', error);
      return null;
    }
  }

  /**
   * Process route page by matching post title to club routes
   * Only runs on custom-route template when no button cards were processed
   */
  async function processRoutePageByTitle() {
    // Only run on route pages
    if (!isRoutePage()) return;

    const placeholder = document.querySelector('.route-stats-placeholder');
    if (!placeholder) return;

    // Skip if already processed
    if (placeholder.dataset.routeStatsProcessed) return;
    placeholder.dataset.routeStatsProcessed = 'true';

    // Get post title
    const postTitle = getPostTitle();
    if (!postTitle) return;

    // Fetch club routes
    const clubRoutes = await fetchClubRoutes();
    if (!clubRoutes || clubRoutes.length === 0) return;

    // Find matching route
    const matchedRoute = findMatchingRoute(postTitle, clubRoutes);
    if (!matchedRoute) return;

    // Get challenge level from tags
    const level = getChallengeLevelFromTags();

    // Load route stats into placeholder (no donuts for title-matched routes)
    loadRouteStats(placeholder, matchedRoute.id, null, level, true);
  }

  /**
   * Set up lazy loading for a map container
   * @param {Element} container - The .route-map element
   */
  function setupLazyMap(container) {
    if (container.dataset.mapInitialized || container.dataset.mapObserved) return;

    // Observe for lazy loading interactive map
    if (mapObserver) {
      container.dataset.mapObserved = 'true';
      mapObserver.observe(container);
    } else {
      // Fallback: load and initialize immediately if no IntersectionObserver
      loadMapboxAndInitialize(container);
    }
  }

  /**
   * Load Mapbox JS (if needed) and initialize the map
   * @param {Element} container - The .route-map element
   */
  async function loadMapboxAndInitialize(container) {
    try {
      await loadMapboxJS();
      initializeInteractiveMap(container);
    } catch (error) {
      console.error('Failed to load Mapbox:', error);
    }
  }

  /**
   * Initialize an interactive Mapbox map in a route-map container
   * @param {Element} container - The .route-map element
   */
  function initializeInteractiveMap(container) {
    if (container.dataset.mapInitialized) return;
    container.dataset.mapInitialized = 'true';

    // Check if Mapbox is available
    if (typeof mapboxgl === 'undefined') {
      console.error('Mapbox GL JS not loaded');
      return;
    }

    // Get data from attributes
    const geojsonStr = container.getAttribute('data-geojson');
    const boundsStr = container.getAttribute('data-bounds');
    const routeUrl = container.getAttribute('data-route-url');

    if (!geojsonStr || !boundsStr) {
      console.error('Missing map data attributes');
      return;
    }

    let geojson, bounds;
    try {
      geojson = JSON.parse(geojsonStr.replace(/&quot;/g, '"'));
      bounds = JSON.parse(boundsStr.replace(/&quot;/g, '"'));
    } catch (e) {
      console.error('Failed to parse map data:', e);
      return;
    }

    // Set Mapbox token
    mapboxgl.accessToken = MAPBOX_TOKEN;

    // Create map
    const map = new mapboxgl.Map({
      container: container,
      style: MAPBOX_STYLE,
      bounds: bounds,
      fitBoundsOptions: { padding: 30 },
      interactive: true,
      attributionControl: false,
      scrollZoom: false, // Prevent accidental zoom while scrolling page
    });

    // Add navigation controls (zoom buttons)
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

    // Enable scroll zoom only when map is focused (click to enable)
    map.on('click', () => {
      map.scrollZoom.enable();
    });
    
    // Disable scroll zoom when mouse leaves
    container.addEventListener('mouseleave', () => {
      map.scrollZoom.disable();
    });

    // Add route line when map loads
    map.on('load', () => {
      map.addSource('route', {
        type: 'geojson',
        data: geojson,
      });

      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': ROUTE_LINE_COLOR,
          'line-width': ROUTE_LINE_WIDTH,
        },
      });
    });

    // Add RWGPS link button overlay
    if (routeUrl) {
      const linkBtn = document.createElement('a');
      linkBtn.href = routeUrl;
      linkBtn.target = '_blank';
      linkBtn.rel = 'noopener noreferrer';
      linkBtn.className = 'route-map-link';
      linkBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';
      linkBtn.title = 'View on RideWithGPS';
      container.appendChild(linkBtn);
    }
  }

  /**
   * Create IntersectionObserver for lazy loading maps
   */
  function createMapObserver() {
    if (!('IntersectionObserver' in window)) {
      return null;
    }

    return new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const container = entry.target;
          // Stop observing this element
          mapObserver.unobserve(container);
          // Load Mapbox (if needed) and initialize map
          loadMapboxAndInitialize(container);
        }
      });
    }, {
      rootMargin: '200px', // Start loading 200px before visible
      threshold: 0
    });
  }

  /**
   * Initialize all maps on the page (for dynamically added content)
   */
  function initializeMaps() {
    const mapContainers = document.querySelectorAll('.route-map');
    mapContainers.forEach(setupLazyMap);
  }

  /**
   * Main processing function
   * 1. Process button cards first (explicit RWGPS links)
   * 2. If no button cards found and on route page, try title matching
   */
  async function processRoutePage() {
    // First, try processing button cards
    const buttonCardsProcessed = processButtonCards();

    // If no button cards were processed and we're on a route page,
    // try matching the post title to club routes
    if (buttonCardsProcessed === 0) {
      await processRoutePageByTitle();
    }
  }

  /**
   * Initialize when DOM is ready
   */
  function init() {
    // Create observer for lazy loading
    mapObserver = createMapObserver();

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', processRoutePage);
    } else {
      processRoutePage();
    }

    // Also observe for dynamically added content (e.g., infinite scroll)
    const mutationObserver = new MutationObserver(mutations => {
      let shouldProcess = false;
      let shouldInitMaps = false;
      
      mutations.forEach(mutation => {
        if (mutation.addedNodes.length) {
          shouldProcess = true;
          // Check if any route-stats were added
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === 1) {
              if (node.classList && node.classList.contains('route-stats')) {
                shouldInitMaps = true;
              }
              if (node.querySelector && node.querySelector('.route-map')) {
                shouldInitMaps = true;
              }
            }
          });
        }
      });
      
      if (shouldProcess) {
        processButtonCards();
      }
      if (shouldInitMaps) {
        // Small delay to ensure DOM is ready
        setTimeout(initializeMaps, 100);
      }
    });

    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  // Start
  init();
})();
