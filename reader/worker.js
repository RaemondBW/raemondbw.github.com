// Cloudflare Worker for dynamic OpenGraph previews
// Deploy this to handle requests to raemond.com/reader/*

import pako from 'pako';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Only handle /reader/* paths
    if (!path.startsWith('/reader/')) {
      return fetch(request);
    }

    // Check if this is a bot/crawler requesting the page (for link previews)
    const userAgent = request.headers.get('User-Agent') || '';
    const isBot = /facebookexternalhit|Twitterbot|LinkedInBot|Slackbot|TelegramBot|WhatsApp|iMessageLinkPreview|Googlebot|bingbot/i.test(userAgent);

    // For non-bots, redirect to the static page or app
    if (!isBot) {
      // Return the static HTML page
      return fetch(`https://raemond.com/reader/index.html`);
    }

    // For bots, generate dynamic OpenGraph meta tags
    const parts = path.split('/').filter(p => p);
    if (parts.length < 2) {
      return generateHTML('Shared Article', 'Open in Reader app to read this article.');
    }

    let base64Content = parts[1];
    let isCompressed = false;

    if (base64Content.startsWith('z')) {
      isCompressed = true;
      base64Content = base64Content.substring(1);
    }

    try {
      // Decode URL-safe base64
      let decoded = atob(base64Content.replace(/-/g, '+').replace(/_/g, '/'));

      let jsonStr;
      if (isCompressed) {
        // Decompress using pako (zlib)
        const compressed = Uint8Array.from(decoded, c => c.charCodeAt(0));
        const decompressed = pako.inflate(compressed);
        jsonStr = new TextDecoder().decode(decompressed);
      } else {
        jsonStr = decoded;
      }

      const article = JSON.parse(jsonStr);
      const title = article.title || 'Shared Article';
      const sourceURL = article.sourceURL;
      const elements = article.elements || [];

      // Get preview text from paragraphs
      const paragraphs = elements
        .filter(e => e.type === 'paragraph')
        .slice(0, 2);
      const previewText = paragraphs.map(p => p.text).join(' ').substring(0, 200);

      // Get first image from article
      const firstImage = elements.find(e => e.type === 'image' && e.imageURL);
      const imageURL = firstImage ? firstImage.imageURL : null;

      // Get source domain
      let sourceDomain = '';
      if (sourceURL) {
        try {
          sourceDomain = new URL(sourceURL).hostname;
        } catch (e) {}
      }

      return generateHTML(title, previewText, sourceDomain, url.href, imageURL);

    } catch (e) {
      console.error('Parse error:', e);
      return generateHTML('Shared Article', 'Open in Reader app to read this article.');
    }
  }
};

function generateHTML(title, description, source = '', originalURL = '', imageURL = null) {
  const escapedTitle = escapeHtml(title);
  const escapedDesc = escapeHtml(description);
  const sourceText = source ? ` from ${source}` : '';

  // Use article's first image, or fall back to default preview
  const ogImage = imageURL || 'https://raemond.com/reader/preview.png';
  const escapedImage = escapeHtml(ogImage);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapedTitle} - Reader</title>

    <!-- OpenGraph meta tags -->
    <meta property="og:title" content="${escapedTitle}">
    <meta property="og:description" content="${escapedDesc}${sourceText}">
    <meta property="og:type" content="article">
    <meta property="og:site_name" content="Reader">
    <meta property="og:image" content="${escapedImage}">
    <meta property="og:url" content="${escapeHtml(originalURL)}">

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapedTitle}">
    <meta name="twitter:description" content="${escapedDesc}${sourceText}">
    <meta name="twitter:image" content="${escapedImage}">

    <!-- Redirect to static page for users -->
    <meta http-equiv="refresh" content="0;url=/reader/index.html">
</head>
<body>
    <p>Redirecting...</p>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html;charset=UTF-8',
      'Cache-Control': 'public, max-age=3600'
    }
  });
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
