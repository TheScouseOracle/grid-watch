# Grid Watch — The Scouse Oracle

A free, reader-funded tool: put in a UK postcode and see the data centres being
built around you — who owns them, what they're worth, and the live planning
applications on your patch. Hosted entirely on GitHub. No paid backend.

## How it works

- **The site** (`index.html`, `assets/`) is static, so GitHub Pages serves it for free.
  In the browser it geocodes the postcode via the free [postcodes.io](https://postcodes.io),
  then matches it against two data files by distance.
- **The register** (`data/datacentres.json`) is *your* curated list of known projects.
  This is the bit you own and grow — your editorial value.
- **The live feed** (`data/planning.json`) is refreshed **daily by a GitHub Action**
  (`.github/workflows/update-planning.yml`), which runs `scripts/pull-planning.mjs`
  to pull recent "data centre" planning applications from [PlanIt](https://www.planit.org.uk)
  (400+ UK councils). This runs on GitHub's servers, so there's no browser/CORS problem.

## Deploy (about 5 minutes)

1. Create a new GitHub repo and upload these files (keep the folder structure).
2. **Settings → Pages →** Source: *Deploy from a branch*, Branch: `main`, Folder: `/ (root)`. Save.
3. Your site goes live at `https://<your-username>.github.io/<repo>/` within a minute or two.
4. **Actions tab →** enable workflows if prompted → open *Update planning feed* → **Run workflow**
   once to populate the live feed immediately (otherwise it first runs on the daily schedule).

That's it. It'll refresh itself every day from then on.

## Make it yours

- **Donation link:** open `assets/app.js`, set `DONATE_URL` to your Ko-fi / Stripe /
  PayPal / Substack page. (There's also a link in `index.html`.)
- **Add projects:** edit `data/datacentres.json`. Each entry wants a name, operator,
  ownership (`US`/`UK`…), an approximate `lat`/`lng`, and a real `source` URL.
- **Widen the net:** in `scripts/pull-planning.mjs` change `KEYWORD` or `DAYS`.
- **Change "near you":** `RADIUS_KM` at the top of `assets/app.js`.

## Honesty / limits (also shown to readers on the page)

This is a **guide, not a definitive record**. The register is incomplete and the
story moves fast. The live feed is raw, unverified applications — a filing is not
a built data centre. Investment figures are announced headline amounts, not local
costs, and nothing here claims a single project raised anyone's bill. Every item
links back to its official source; verify before you publish a figure.

Data sources: PlanIt (planning applications), postcodes.io (geocoding), plus your
own reporting, company announcements, grid-connection data and Find a Tender.
