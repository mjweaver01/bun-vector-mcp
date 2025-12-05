/**
 * Web content extraction utilities for extracting main content from HTML
 */

import { stripHtml } from './text';

export interface ExtractedContent {
  text: string;
  title: string;
  description?: string;
  url: string;
}

/**
 * Extract text content from an accessibility snapshot
 * Browser snapshots provide a structured view of the page that's easier to parse
 */
export function extractFromSnapshot(snapshot: string, url: string): ExtractedContent {
  // For now, just return the snapshot text as-is
  // The accessibility snapshot already filters out most non-content elements
  const lines = snapshot.split('\n');
  const title = lines.find(line => line.trim().length > 0)?.trim() || 'Untitled';
  
  return {
    text: snapshot,
    title,
    url,
  };
}

/**
 * Calculate content density score for an HTML element
 * Higher score means more likely to be main content
 */
function calculateContentDensity(html: string): number {
  const textLength = stripHtml(html).length;
  const htmlLength = html.length;
  
  if (htmlLength === 0) return 0;
  
  // Ratio of text to HTML markup
  const density = textLength / htmlLength;
  
  // Bonus points for longer text
  const lengthBonus = Math.min(textLength / 1000, 2);
  
  return density + lengthBonus;
}

/**
 * Extract main content from HTML
 * Uses heuristics to identify the main content area
 */
export function extractMainContent(html: string, url: string): ExtractedContent {
  let mainContent = '';
  let title = '';
  let description = '';
  
  // Extract title
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/is);
  if (titleMatch && titleMatch[1]) {
    title = stripHtml(titleMatch[1]).trim();
  }
  
  // Extract meta description
  const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i);
  if (descMatch && descMatch[1]) {
    description = descMatch[1].trim();
  }
  
  // Try to find main content using semantic HTML5 tags
  const mainTagMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  
  if (mainTagMatch && mainTagMatch[1]) {
    mainContent = mainTagMatch[1];
  } else if (articleMatch && articleMatch[1]) {
    mainContent = articleMatch[1];
  } else {
    // Fallback: look for divs with content-related classes/ids
    const contentPatterns = [
      /<div[^>]*(?:id|class)=["'][^"']*(?:content|main|article|post|entry)[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi,
    ];
    
    let bestMatch = '';
    let bestScore = 0;
    
    for (const pattern of contentPatterns) {
      let match;
      const regex = new RegExp(pattern);
      while ((match = regex.exec(html)) !== null) {
        const content = match[1]!;
        const score = calculateContentDensity(content);
        
        if (score > bestScore) {
          bestScore = score;
          bestMatch = content;
        }
      }
    }
    
    if (bestMatch) {
      mainContent = bestMatch;
    } else {
      // Last resort: extract body content
      const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      if (bodyMatch && bodyMatch[1]) {
        mainContent = bodyMatch[1];
      } else {
        // Use entire HTML if body not found
        mainContent = html;
      }
    }
  }
  
  // Remove common non-content elements from main content
  let cleaned = mainContent;
  
  // Remove nav, header, footer, sidebar, aside
  cleaned = cleaned.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '');
  cleaned = cleaned.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '');
  cleaned = cleaned.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '');
  cleaned = cleaned.replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '');
  cleaned = cleaned.replace(/<div[^>]*(?:id|class)=["'][^"']*(?:sidebar|nav|menu|footer|header)[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, '');
  
  // Remove comments
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');
  
  // Strip all HTML tags and get clean text
  const text = stripHtml(cleaned);
  
  // Use title from content if not found in title tag
  if (!title && text) {
    const firstLine = text.split('\n')[0]?.trim();
    if (firstLine && firstLine.length < 200) {
      title = firstLine;
    } else {
      title = 'Untitled';
    }
  }
  
  return {
    text: text.trim(),
    title: title || 'Untitled',
    description,
    url,
  };
}

/**
 * Validate that a URL is safe to visit
 */
export function isValidUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    // Only allow http and https protocols
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Normalize URL for consistent processing
 */
export function normalizeUrl(urlString: string): string {
  try {
    const url = new URL(urlString);
    // Remove trailing slashes and fragments
    url.hash = '';
    let normalized = url.toString();
    if (normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    return urlString;
  }
}


