/**
 * RWGPS Route Stats Worker
 * 
 * Cloudflare Worker that fetches route data from RideWithGPS,
 * calculates technical difficulty, and renders route stats cards.
 * 
 * Implements stale-while-revalidate caching with hash-based change detection.
 */

import { fetchRouteData } from './rwgps.js';
import { renderRouteStatsCard, renderErrorCard } from './renderer.js';
import {
  getCachedRoute,
  setCachedRoute,
  isStale,
  hasDataChanged,
  getCachedHtml,
  updateCachedHtml,
  generateDataHash,
} from './cache.js';

/**
 * CORS headers for cross-origin requests
 */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

/**
 * Handle CORS preflight requests
 */
function handleOptions() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

/**
 * Create a JSON error response
 */
function errorResponse(message, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
  });
}

/**
 * Create an HTML response with cache headers
 */
function htmlResponse(html, dataHash) {
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Data-Hash': dataHash,
      'Cache-Control': 'public, max-age=300', // 5 min browser cache
      ...CORS_HEADERS,
    },
  });
}

/**
 * Fetch fresh data and update cache (used for background revalidation)
 */
async function revalidateCache(routeId, stars, level, env, cached) {
  try {
    const freshRouteData = await fetchRouteData(routeId, env);
    
    // Check if data actually changed
    if (hasDataChanged(cached, freshRouteData)) {
      // Re-render HTML with fresh data
      const html = renderRouteStatsCard({
        routeData: freshRouteData,
        physicalDifficulty: stars,
        challengeLevel: level,
      });

      // Update cache with new data and HTML
      const updatedCache = updateCachedHtml(
        { ...cached, routeData: freshRouteData, dataHash: generateDataHash(freshRouteData) },
        stars,
        html
      );
      
      await setCachedRoute(env.ROUTE_CACHE, routeId, freshRouteData, updatedCache.renderedHtml);
      
      console.log(`Route ${routeId}: Data changed, cache updated`);
    } else {
      console.log(`Route ${routeId}: Data unchanged, skipping update`);
    }
  } catch (error) {
    console.error(`Background revalidation failed for route ${routeId}:`, error);
  }
}

/**
 * Main request handler
 */
async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  
  // Only handle /route-stats endpoint
  if (url.pathname !== '/route-stats') {
    return errorResponse('Not found', 404);
  }

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return handleOptions();
  }

  // Only allow GET requests
  if (request.method !== 'GET') {
    return errorResponse('Method not allowed', 405);
  }

  // Parse query parameters
  const routeId = url.searchParams.get('id');
  const stars = parseInt(url.searchParams.get('stars'), 10);
  const level = url.searchParams.get('level');
  const purge = url.searchParams.get('purge') === 'true';

  // Validate required parameters
  if (!routeId) {
    return errorResponse('Missing required parameter: id');
  }
  if (!stars || stars < 1 || stars > 5) {
    return errorResponse('Invalid parameter: stars (must be 1-5)');
  }
  if (!level) {
    return errorResponse('Missing required parameter: level');
  }

  try {
    // Purge cache if requested
    if (purge) {
      await env.ROUTE_CACHE.delete(`route:${routeId}`);
      console.log(`Route ${routeId}: Cache purged`);
    }

    // Check cache first
    const cached = purge ? null : await getCachedRoute(env.ROUTE_CACHE, routeId);
    
    if (cached) {
      // Check if we have pre-rendered HTML for this star rating
      const cachedHtml = getCachedHtml(cached, stars);
      
      if (cachedHtml) {
        // Return cached HTML immediately
        const response = htmlResponse(cachedHtml, cached.dataHash);
        
        // If stale, trigger background revalidation
        if (isStale(cached)) {
          ctx.waitUntil(revalidateCache(routeId, stars, level, env, cached));
        }
        
        return response;
      }
      
      // Have cached route data but not HTML for this star rating
      // Render HTML and update cache
      const html = renderRouteStatsCard({
        routeData: cached.routeData,
        physicalDifficulty: stars,
        challengeLevel: level,
      });
      
      // Update cache with new HTML variation
      const updatedCache = updateCachedHtml(cached, stars, html);
      ctx.waitUntil(
        setCachedRoute(env.ROUTE_CACHE, routeId, cached.routeData, updatedCache.renderedHtml)
      );
      
      // If stale, also trigger background revalidation
      if (isStale(cached)) {
        ctx.waitUntil(revalidateCache(routeId, stars, level, env, cached));
      }
      
      return htmlResponse(html, cached.dataHash);
    }

    // Cache miss: fetch fresh data from RWGPS
    const routeData = await fetchRouteData(routeId, env);
    
    // Render HTML
    const html = renderRouteStatsCard({
      routeData,
      physicalDifficulty: stars,
      challengeLevel: level,
    });
    
    // Generate hash for client-side caching
    const dataHash = generateDataHash(routeData);
    
    // Store in cache (don't wait for it)
    ctx.waitUntil(
      setCachedRoute(env.ROUTE_CACHE, routeId, routeData, { [`stars_${stars}`]: html })
    );

    return htmlResponse(html, dataHash);
    
  } catch (error) {
    console.error(`Error processing route ${routeId}:`, error);
    
    // Return error card HTML instead of JSON error
    const errorHtml = renderErrorCard(error.message || 'Failed to load route data');
    return new Response(errorHtml, {
      status: 200, // Return 200 so the error card displays
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        ...CORS_HEADERS,
      },
    });
  }
}

/**
 * Worker entry point
 */
export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env, ctx);
  },
};
