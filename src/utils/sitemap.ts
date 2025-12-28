/**
 * Sitemap parsing and URL extraction utilities
 */

import { log, error } from './logger';

export interface SitemapUrl {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: string;
}

/**
 * Parse sitemap XML and extract URL locations
 */
export function parseSitemap(xmlContent: string): SitemapUrl[] {
  const urls: SitemapUrl[] = [];

  // Match all <url> blocks in the sitemap
  const urlRegex = /<url>([\s\S]*?)<\/url>/g;
  const locRegex = /<loc>(.*?)<\/loc>/;
  const lastmodRegex = /<lastmod>(.*?)<\/lastmod>/;
  const changefreqRegex = /<changefreq>(.*?)<\/changefreq>/;
  const priorityRegex = /<priority>(.*?)<\/priority>/;

  let match;
  while ((match = urlRegex.exec(xmlContent)) !== null) {
    const urlBlock = match[1]!;
    const locMatch = urlBlock.match(locRegex);

    if (locMatch && locMatch[1]) {
      const url: SitemapUrl = {
        loc: locMatch[1].trim(),
      };

      const lastmodMatch = urlBlock.match(lastmodRegex);
      if (lastmodMatch && lastmodMatch[1]) {
        url.lastmod = lastmodMatch[1].trim();
      }

      const changefreqMatch = urlBlock.match(changefreqRegex);
      if (changefreqMatch && changefreqMatch[1]) {
        url.changefreq = changefreqMatch[1].trim();
      }

      const priorityMatch = urlBlock.match(priorityRegex);
      if (priorityMatch && priorityMatch[1]) {
        url.priority = priorityMatch[1].trim();
      }

      urls.push(url);
    }
  }

  return urls;
}

/**
 * Detect if sitemap XML is a sitemap index file
 */
export function isSitemapIndex(xmlContent: string): boolean {
  return (
    xmlContent.includes('<sitemapindex') || xmlContent.includes('<sitemap>')
  );
}

/**
 * Parse sitemap index and extract sitemap URLs
 */
export function parseSitemapIndex(xmlContent: string): string[] {
  const sitemapUrls: string[] = [];

  // Match all <sitemap> blocks in the sitemap index
  const sitemapRegex = /<sitemap>([\s\S]*?)<\/sitemap>/g;
  const locRegex = /<loc>(.*?)<\/loc>/;

  let match;
  while ((match = sitemapRegex.exec(xmlContent)) !== null) {
    const sitemapBlock = match[1]!;
    const locMatch = sitemapBlock.match(locRegex);

    if (locMatch && locMatch[1]) {
      sitemapUrls.push(locMatch[1].trim());
    }
  }

  return sitemapUrls;
}

/**
 * Fetch sitemap content from URL
 */
export async function fetchSitemap(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; RAG-Ingester/1.0)',
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch sitemap: ${response.status} ${response.statusText}`
    );
  }

  const contentType = response.headers.get('content-type') || '';

  // Handle gzipped sitemaps
  if (contentType.includes('gzip') || url.endsWith('.gz')) {
    const buffer = await response.arrayBuffer();
    // Decompress using Bun's built-in decompression
    const decompressed = Bun.gunzipSync(new Uint8Array(buffer));
    return new TextDecoder().decode(decompressed);
  }

  return await response.text();
}

/**
 * Recursively extract all URLs from sitemap (handles nested sitemap indexes)
 */
export async function extractAllUrls(
  sitemapUrl: string,
  maxDepth: number = 3
): Promise<SitemapUrl[]> {
  const allUrls: SitemapUrl[] = [];
  const visitedSitemaps = new Set<string>();

  async function extractRecursive(
    url: string,
    depth: number = 0
  ): Promise<void> {
    // Prevent infinite recursion and re-visiting sitemaps
    if (depth > maxDepth || visitedSitemaps.has(url)) {
      return;
    }

    visitedSitemaps.add(url);

    try {
      log(`  Fetching sitemap: ${url} (depth: ${depth})`);
      const xmlContent = await fetchSitemap(url);

      // Check if this is a sitemap index
      if (isSitemapIndex(xmlContent)) {
        log(`  Found sitemap index with nested sitemaps`);
        const nestedSitemaps = parseSitemapIndex(xmlContent);

        // Recursively process each nested sitemap
        for (const nestedUrl of nestedSitemaps) {
          await extractRecursive(nestedUrl, depth + 1);
        }
      } else {
        // Regular sitemap - extract URLs
        const urls = parseSitemap(xmlContent);
        log(`  Found ${urls.length} URLs in sitemap`);
        allUrls.push(...urls);
      }
    } catch (err) {
      error(
        `  Error processing sitemap ${url}:`,
        err instanceof Error ? err.message : String(err)
      );
      // Continue processing other sitemaps even if one fails
    }
  }

  await extractRecursive(sitemapUrl);

  return allUrls;
}
