# TurnDeal official website

Requires Node.js 24. Run these commands from the repository root.

```sh
npm ci --prefix site
npm --prefix site run dev
```

Open [the local site](http://127.0.0.1:4321/TurnDeal/). The six English and Traditional Chinese routes are generated as static HTML.

```sh
npm --prefix site run check
npm --prefix site run build
```

## Update public content

Edit the bilingual copy and milestone entries in `src/content/`. The current gallery uses compressed copies of the three photographs linked in the [project write-up](https://muenchiu.com/zh/projects/turn-deal). Confirm reuse permission, individual team profiles, and event details before public release.

## Refresh demo traces

From the repository root, install its dependencies with `npm ci` and run `node scripts/export-site-demo.mjs`. The exporter runs the offline engine against an in-memory fixture database and writes the allowlisted projections into `public/demo-traces/`. CI runs the exporter with `--check` to validate those checked-in files.

The site fetches a trace only when a visitor starts or restores the replay. The simulation state stays in the current browser tab, and an accepted offer leads to a mock confirmation.

## GitHub Pages

Choose **GitHub Actions** as the source in the repository’s **Settings → Pages**. The deploy workflow uploads `site/dist/` after verification. GitHub Pages serves the site from [the TurnDeal project path](https://muen1019.github.io/TurnDeal/).
