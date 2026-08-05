/**
 * The lab notebook.
 *
 * Posts are dated markdown in src/posts/. Everything here is a working note
 * written while the work happened — including the wrong turns, which are the
 * point. A note that only records what survived is a press release.
 */
export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy('src/assets');

  eleventyConfig.addFilter('isoDate', (d) =>
    d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));

  eleventyConfig.addFilter('readableDate', (d) => {
    const dt = d instanceof Date ? d : new Date(d);
    return dt.toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
  });

  // Newest first, which is the order a notebook is actually read in.
  eleventyConfig.addCollection('notes', (api) =>
    api.getFilteredByTag('posts').sort((a, b) => b.date - a.date));

  return {
    dir: {
      input: 'src',
      // Built HTML is COMMITTED, and lands beside the world it documents.
      //
      // GitHub Pages serves this repo from the root of `main` with no Actions,
      // so nothing builds server-side: whatever is committed is what is served.
      // The output therefore cannot live in `_site` — Jekyll, which Pages runs
      // by default, ignores every path beginning with an underscore, so a
      // committed `_site` would 404. (There is also a `.nojekyll` at the repo
      // root now, which is belt and braces.)
      output: '../lab',
      includes: '_includes',
    },
    // Pages serves the repo under /isle_of_glitch/, and this notebook under a
    // further two directories. Without this every link would resolve against
    // the domain root and 404. It only applies to URLs passed through the
    // `url` filter, so every internal link must use it.
    pathPrefix: '/isle_of_glitch/magpie/mazeballs/lab/',
    markdownTemplateEngine: 'njk',
    htmlTemplateEngine: 'njk',
  };
}
