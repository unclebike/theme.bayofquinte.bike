/**
 * Route Stats Client-Side Script
 * 
 * Finds Ghost product cards with RideWithGPS URLs and replaces them
 * with route stats cards fetched from the Cloudflare Worker.
 * 
 * Uses localStorage for hash-based change detection and silent updates.
 * Implements lazy loading with IntersectionObserver for performance.
 */

(function() {
  'use strict';

  // Configuration
  const WORKER_URL_PRIMARY = 'https://api.bayofquinte.bike/route-stats';
  const WORKER_URL_FALLBACK = 'https://rwgps-route-stats.adam-7e5.workers.dev/route-stats';
  const STORAGE_PREFIX = 'route-stats-hash:';
  
  // Mapbox configuration
  const MAPBOX_TOKEN = 'pk.eyJ1IjoidGlsbGV5IiwiYSI6IlFhX1ZUYm8ifQ.Dr4lrivYwl5ZTnuAdMqzVg';
  const MAPBOX_STYLE = 'mapbox://styles/tilley/cl0sia1dj000u14nmil6oqaox?v=2';
  const ROUTE_LINE_COLOR = 'hsl(8, 75%, 60%)';
  const ROUTE_LINE_WIDTH = 4;

  // IntersectionObserver for lazy loading
  let mapObserver = null;

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
   * Count active stars in product card rating
   * @param {Element} card - Product card element
   * @returns {number} Number of active stars (1-5)
   */
  function countStars(card) {
    const activeStars = card.querySelectorAll('.kg-product-card-rating-active');
    return activeStars.length || 3; // Default to 3 if no rating found
  }

  /**
   * Get challenge level text from button
   * @param {Element} button - Button/link element
   * @returns {string} Challenge level text
   */
  function getChallengeLevel(button) {
    return button.textContent.trim() || 'Explorer';
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
   * Fetch route stats from worker and replace product card
   * @param {Element} card - Product card element to replace
   * @param {string} routeId - RWGPS route ID
   * @param {number} stars - Physical difficulty stars
   * @param {string} level - Challenge level text
   */
  async function loadRouteStats(card, routeId, stars, level) {
    // Try primary URL first, fallback if it fails
    async function tryFetch(baseUrl) {
      const url = new URL(baseUrl);
      url.searchParams.set('id', routeId);
      url.searchParams.set('stars', stars);
      url.searchParams.set('level', level);
      return fetch(url.toString());
    }

    try {
      let response;
      try {
        response = await tryFetch(WORKER_URL_PRIMARY);
      } catch (e) {
        // Primary failed (DNS not ready), try fallback
        response = await tryFetch(WORKER_URL_FALLBACK);
      }
      
      if (!response.ok) {
        console.error(`Route stats fetch failed: ${response.status}`);
        return;
      }

      const html = await response.text();
      const newHash = response.headers.get('X-Data-Hash');
      const storedHash = getStoredHash(routeId);

      // Check if we need to update
      // Always update on first load or if hash changed
      if (!storedHash || storedHash !== newHash || !card.dataset.routeStatsLoaded) {
        // Create a temporary container to parse the HTML
        const temp = document.createElement('div');
        temp.innerHTML = html;
        const routeStatsElement = temp.firstElementChild;

        if (routeStatsElement) {
          // Replace the product card with route stats
          card.replaceWith(routeStatsElement);
          
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
   * Find and process all product cards with RWGPS URLs
   */
  function processProductCards() {
    // Find all product cards
    const productCards = document.querySelectorAll('.kg-product-card');

    productCards.forEach(card => {
      // Skip already processed cards
      if (card.dataset.routeStatsProcessed) return;
      card.dataset.routeStatsProcessed = 'true';

      // Find button/link with RWGPS URL
      const button = card.querySelector('a[href*="ridewithgps.com/routes"]');
      if (!button) return;

      const routeId = extractRouteId(button.href);
      if (!routeId) return;

      // Extract data from product card
      const stars = countStars(card);
      const level = getChallengeLevel(button);

      // Load and replace
      loadRouteStats(card, routeId, stars, level);
    });
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
      // Fallback: initialize immediately if no IntersectionObserver
      initializeInteractiveMap(container);
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
          // Initialize interactive map
          initializeInteractiveMap(container);
        }
      });
    }, {
      rootMargin: '100px', // Start loading 100px before visible
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
   * Initialize when DOM is ready
   */
  function init() {
    // Create observer for lazy loading
    mapObserver = createMapObserver();

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', processProductCards);
    } else {
      processProductCards();
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
        processProductCards();
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
