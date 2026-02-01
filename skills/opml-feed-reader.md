# OPML Feed Reader Skill

Parse OPML files and fetch RSS/Atom feeds.

## Files

- `third_party/hn_2025_feeds.opml` - 90+ curated tech blog feeds from HN popular posts 2025
- `third_party/opml-reader.mjs` - Node.js utility for parsing and fetching

## CLI Usage

```bash
# List all feeds
node third_party/opml-reader.mjs list

# Search feeds by title
node third_party/opml-reader.mjs search "simon"

# Fetch from a random feed
node third_party/opml-reader.mjs random

# Fetch specific feed URL
node third_party/opml-reader.mjs fetch "https://simonwillison.net/atom/everything/"
```

## Programmatic Usage

```javascript
import { parseOPML, fetchFeed, searchFeeds } from './third_party/opml-reader.mjs';

// Parse OPML file
const feeds = parseOPML('third_party/hn_2025_feeds.opml');
// Returns: [{ title, feedUrl, siteUrl }, ...]

// Fetch items from a feed
const result = await fetchFeed('https://example.com/feed.xml', 5);
// Returns: { success: true, items: [{ title, link, date }, ...] }

// Search by title
const matches = searchFeeds('security', 'third_party/hn_2025_feeds.opml');
```

## Feed Sources

The HN 2025 feeds collection includes:
- **simonwillison.net** - AI/LLM development, datasette
- **krebsonsecurity.com** - Security research
- **pluralistic.net** - Cory Doctorow on tech policy
- **rachelbythebay.com** - Systems programming
- **matklad.github.io** - Rust, IDE development
- **devblogs.microsoft.com/oldnewthing** - Windows internals
- And 80+ more curated tech blogs

## OPML Format

Standard OPML 2.0 with RSS outline elements:

```xml
<outline type="rss"
         text="blog-name"
         title="blog-name"
         xmlUrl="https://example.com/feed.xml"
         htmlUrl="https://example.com"/>
```

## Adding Custom OPML Files

Pass any OPML file path to the commands:

```bash
node third_party/opml-reader.mjs list /path/to/custom.opml
```
