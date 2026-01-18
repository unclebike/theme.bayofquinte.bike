/**
 * Route Stats Client-Side Script
 * 
 * Finds Ghost product cards with RideWithGPS URLs and replaces them
 * with route stats cards fetched from the Cloudflare Worker.
 * 
 * Uses localStorage for hash-based change detection and silent updates.
 */

(function() {
  'use strict';

  // Configuration
  const WORKER_URL = 'https://api.bayofquinte.bike/route-stats';
  const STORAGE_PREFIX = 'route-stats-hash:';

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
    const url = new URL(WORKER_URL);
    url.searchParams.set('id', routeId);
    url.searchParams.set('stars', stars);
    url.searchParams.set('level', level);

    try {
      const response = await fetch(url.toString());
      
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
   * Initialize when DOM is ready
   */
  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', processProductCards);
    } else {
      processProductCards();
    }

    // Also observe for dynamically added content (e.g., infinite scroll)
    const observer = new MutationObserver(mutations => {
      let shouldProcess = false;
      mutations.forEach(mutation => {
        if (mutation.addedNodes.length) {
          shouldProcess = true;
        }
      });
      if (shouldProcess) {
        processProductCards();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  // Start
  init();
})();
