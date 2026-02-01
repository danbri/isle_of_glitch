#!/usr/bin/env node
/**
 * OPML Feed Reader Utility
 *
 * Parse OPML files and fetch RSS/Atom feeds.
 *
 * Usage:
 *   node opml-reader.mjs list [opml-file]     - List all feeds in OPML
 *   node opml-reader.mjs fetch <feed-url>    - Fetch items from a single feed
 *   node opml-reader.mjs random [opml-file]  - Fetch from a random feed
 *   node opml-reader.mjs search <term> [opml-file] - Search feed titles
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OPML = join(__dirname, 'hn_2025_feeds.opml');

/**
 * Parse OPML file and extract feed entries
 */
function parseOPML(opmlPath) {
    const content = readFileSync(opmlPath, 'utf-8');
    const feeds = [];

    // Extract outline elements with xmlUrl (RSS feeds)
    const outlineRegex = /<outline[^>]*type="rss"[^>]*>/g;
    const matches = content.matchAll(outlineRegex);

    for (const match of matches) {
        const outline = match[0];

        const textMatch = outline.match(/text="([^"]+)"/);
        const xmlUrlMatch = outline.match(/xmlUrl="([^"]+)"/);
        const htmlUrlMatch = outline.match(/htmlUrl="([^"]+)"/);

        if (xmlUrlMatch) {
            feeds.push({
                title: textMatch ? textMatch[1] : 'Unknown',
                feedUrl: xmlUrlMatch[1],
                siteUrl: htmlUrlMatch ? htmlUrlMatch[1] : null
            });
        }
    }

    return feeds;
}

/**
 * Fetch and parse an RSS/Atom feed
 */
async function fetchFeed(feedUrl, limit = 5) {
    try {
        const response = await fetch(feedUrl, {
            headers: {
                'User-Agent': 'OPML-Reader/1.0 (isle-of-glitch)'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const xml = await response.text();
        const items = [];

        // Try RSS format first
        const rssItemRegex = /<item>([\s\S]*?)<\/item>/g;
        let matches = [...xml.matchAll(rssItemRegex)];

        if (matches.length > 0) {
            for (const match of matches.slice(0, limit)) {
                const itemXml = match[1];
                const title = itemXml.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/s)?.[1] || 'No title';
                const link = itemXml.match(/<link>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/link>/s)?.[1] || '';
                const pubDate = itemXml.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';

                items.push({ title: cleanText(title), link: cleanText(link), date: pubDate });
            }
        } else {
            // Try Atom format
            const atomEntryRegex = /<entry>([\s\S]*?)<\/entry>/g;
            matches = [...xml.matchAll(atomEntryRegex)];

            for (const match of matches.slice(0, limit)) {
                const entryXml = match[1];
                const title = entryXml.match(/<title[^>]*>(.*?)<\/title>/s)?.[1] || 'No title';
                const link = entryXml.match(/<link[^>]*href="([^"]+)"/)?.[1] || '';
                const updated = entryXml.match(/<updated>(.*?)<\/updated>/)?.[1] || '';

                items.push({ title: cleanText(title), link, date: updated });
            }
        }

        return { success: true, items };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

function cleanText(text) {
    return text.replace(/<!\[CDATA\[|\]\]>/g, '').trim();
}

/**
 * List all feeds from OPML
 */
function listFeeds(opmlPath) {
    const feeds = parseOPML(opmlPath);
    console.log(`Found ${feeds.length} feeds:\n`);

    feeds.forEach((feed, i) => {
        console.log(`${i + 1}. ${feed.title}`);
        console.log(`   Feed: ${feed.feedUrl}`);
        if (feed.siteUrl) console.log(`   Site: ${feed.siteUrl}`);
        console.log();
    });

    return feeds;
}

/**
 * Search feeds by title
 */
function searchFeeds(term, opmlPath) {
    const feeds = parseOPML(opmlPath);
    const matches = feeds.filter(f =>
        f.title.toLowerCase().includes(term.toLowerCase())
    );

    console.log(`Found ${matches.length} feeds matching "${term}":\n`);
    matches.forEach(feed => {
        console.log(`- ${feed.title}`);
        console.log(`  ${feed.feedUrl}\n`);
    });

    return matches;
}

/**
 * Fetch from a random feed
 */
async function fetchRandom(opmlPath) {
    const feeds = parseOPML(opmlPath);
    const feed = feeds[Math.floor(Math.random() * feeds.length)];

    console.log(`Fetching from: ${feed.title}\n`);
    console.log(`Feed URL: ${feed.feedUrl}\n`);

    const result = await fetchFeed(feed.feedUrl);

    if (result.success) {
        console.log(`Recent items:\n`);
        result.items.forEach((item, i) => {
            console.log(`${i + 1}. ${item.title}`);
            if (item.link) console.log(`   ${item.link}`);
            if (item.date) console.log(`   ${item.date}`);
            console.log();
        });
    } else {
        console.log(`Error fetching feed: ${result.error}`);
    }

    return { feed, result };
}

// CLI interface
const args = process.argv.slice(2);
const command = args[0];

if (!command || command === 'help') {
    console.log(`
OPML Feed Reader

Commands:
  list [opml-file]           List all feeds
  fetch <feed-url>           Fetch items from a feed URL
  random [opml-file]         Fetch from a random feed
  search <term> [opml-file]  Search feed titles

Default OPML: hn_2025_feeds.opml (90+ HN popular blogs)
`);
} else if (command === 'list') {
    listFeeds(args[1] || DEFAULT_OPML);
} else if (command === 'fetch' && args[1]) {
    fetchFeed(args[1]).then(result => {
        if (result.success) {
            result.items.forEach((item, i) => {
                console.log(`${i + 1}. ${item.title}`);
                if (item.link) console.log(`   ${item.link}`);
                console.log();
            });
        } else {
            console.log(`Error: ${result.error}`);
        }
    });
} else if (command === 'random') {
    fetchRandom(args[1] || DEFAULT_OPML);
} else if (command === 'search' && args[1]) {
    searchFeeds(args[1], args[2] || DEFAULT_OPML);
} else {
    console.log('Unknown command. Run with "help" for usage.');
}

// Export for programmatic use
export { parseOPML, fetchFeed, listFeeds, searchFeeds, fetchRandom };
