---
title: "Publishing this notebook with no CI: committed HTML, and two ways it silently 404s"
date: 2026-08-05T19:00:00Z
tags: [ops, eleventy, pages]
---

This notebook is now on GitHub Pages. The constraint that shaped every decision:
**Pages serves this repo from the root of `main` with no Actions**, so nothing is
built server-side. Whatever HTML is committed is exactly what is served.

That makes the build a step a human has to remember. Three things had to be got
right, and two of them fail *silently* — the page 404s or renders with dead links,
with nothing anywhere saying why.

## 1. The output cannot live in `_site`

Pages runs **Jekyll** by default, and Jekyll ignores every path beginning with an
underscore. Eleventy's default output directory is `_site`. Committing it would
have produced a site that built perfectly, pushed perfectly, and served nothing.

Two independent fixes, both applied because either alone is fragile:

- output goes to `lab/`, not `_site/`
- `.nojekyll` at the repo root, which turns Jekyll off entirely

There was no Jekyll configuration in this repo to begin with — no `_config.yml`,
no `Gemfile`, no `_layouts` — so disabling it costs nothing. Worth checking before
adding `.nojekyll` to a repo that *does* use it.

## 2. Every internal link needs the path prefix

The deployed notebook lives at

```
https://danbri.github.io/isle_of_glitch/magpie/mazeballs/lab/
```

— three directories deep. Eleventy generates root-relative URLs like
`/posts/2026-08-05-three-blockers/`, which against that domain resolve to
`danbri.github.io/posts/...` and 404.

`pathPrefix` in the config fixes it, but **only for URLs passed through the `url`
filter**. A link written as `href="{{ note.url }}"` is silently unprefixed; it has
to be `href="{{ note.url | url }}"`. The index page and the home link in the layout
both needed it. Verified after building rather than assumed:

```
$ grep -o 'href="[^"]*"' lab/index.html
href="/isle_of_glitch/magpie/mazeballs/lab/"
href="/isle_of_glitch/magpie/mazeballs/lab/posts/2026-08-05-dev2-first-build/"
...
```

Local preview needs the opposite, since localhost serves at the root, so
`./tools/notes serve` overrides it with `--pathprefix=/`.

## 3. The stale workflow is a decoy

`.github/workflows/static.yml` exists and looks like it deploys Pages. It does
not — it triggers only on `push` to `claude/fink-authoring-guide-bDtaY`, the
*previous* deploy branch, and never fires on `main`. It is left in place
deliberately; nothing here depends on it, and deleting it is a separate decision.
But anyone reading the repo would reasonably assume CI handles the build. It does
not.

## The answer to "can we invoke the build somehow?"

Not from CI, given the constraint. So: build locally and commit, with the two
steps welded together so they cannot drift.

```sh
./tools/notes build      # into ../lab
./tools/notes serve      # live preview at localhost:8080
./tools/notes publish    # build + stage + commit + pull --rebase + push
```

`publish` is the one that matters. Source and built page are committed in the same
commit, so the deployed site is never a stale render of a newer note — which is
the failure mode of every "remember to run the build" workflow ever written.

It uses `pull --rebase` and never forces, because `main` is shared with a laptop
session and races are expected.

## What this does not solve

The build still only happens when someone runs it. A `pre-commit` hook that
rebuilds whenever `notes/src` is staged would close that, and is the obvious next
step if the notebook is ever edited without going through `publish`. I have not
added one, because a hook that rewrites your commit contents is its own kind of
surprise and should be opted into deliberately.
