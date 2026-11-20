# Figma to CSS

A web app that converts your Figma designs into clean, usable CSS and HTML. Export layers from Figma, select the ones you want, configure output settings, and download CSS — or a ready-to-open `.zip` with `index.html`, `styles.css` and an `images/` folder.

## Features

- **Plugin export (recommended)** — a small Figma plugin exports your selection with images, vectors and preview renders. No token, no rate limits.
- **API token mode** — load a file through the Figma REST API, with aggressive caching to save your monthly quota
- **Layer Tree Browser** — browse and select specific frames/components to convert
- **Output Settings** — naming conventions, flexbox or absolute layout, CSS variables, dimensions
- **Asset Detection** — image fills (deduplicated) and fonts used in your selection
- **CSS/HTML Generation** — preview, compare with the Figma render, copy, or download as a zip

## Method 1: Plugin export (recommended)

The Figma Plugin API has no rate limits, so this works on every plan and seat type.

### Install the plugin (once)

1. Clone this repository (see [Setup](#setup)).
2. Open the **Figma desktop app** (development plugins can't be imported in the browser). There is no official Linux app; use Windows/macOS or the unofficial [figma-linux](https://github.com/Figma-Linux/figma-linux) app.
3. Open any **design file** (the option isn't available from the file browser).
4. Press **Ctrl + K** (**⌘ K** on macOS; **Ctrl + /** in older Figma versions), type **import plugin from manifest**, and press Enter.
   - Or click **Actions** in the bottom toolbar → **Plugins & widgets** → **Development** → **Import from manifest…**
   - In the older Figma UI: Menu → **Plugins → Development → Import plugin from manifest…**
5. Choose `plugin/manifest.json` from this repository.

### Export a design

1. Select one or more layers (frames, components, …) on the current page.
2. Press **Ctrl + K** and search **FigToCSS Exporter** (or **Actions → Plugins & widgets → Development → FigToCSS Exporter**).
3. Click **Export selection**, then **Download .figtocss.json** (or **Copy to clipboard**).
4. In the web app, choose **Plugin export** and drop the file (or paste the JSON).

## Method 2: API token

Since 2025-11-17 Figma's REST API rate limits are applied **per user who created the token**, based on the plan of the file being read:

| Tier | Endpoints | View / Collab seats | Dev / Full seats |
| --- | --- | --- | --- |
| Tier 1 | `GET /v1/files/:key`, `/v1/files/:key/nodes`, `/v1/images/:key` (renders) | up to **20 per month** (Starter files about 6/month) | per-minute limits |
| Tier 2 | `GET /v1/files/:key/images` (image fills) | 5 per minute | higher per-minute limits |
| Tier 3 | `GET /v1/files/:key/meta` | 10 per minute | higher per-minute limits |

Free, View and Collab seats therefore run out after a few sessions. To spend as little as possible, the app:

- caches each file in your browser (IndexedDB) and only checks `/meta` (Tier 3) to see whether it changed,
- loads all image fills with **one** Tier 2 call (cached for 7 days),
- only fetches a Figma render for **Compare** when you click "Load Figma render" (cached for 7 days),
- never retries failed 4xx requests, and explains 429 errors (time until reset, seat type).

Use **Force reload from Figma** only when you need a fresh copy — it uses one monthly Tier 1 call.

### Getting a personal access token

1. Log in to [Figma](https://www.figma.com)
2. Click your profile icon in the top-left corner and select **Settings**
3. Find the **Personal access tokens** section
4. Click **Generate new token** and give it a name (e.g. "Figma to CSS") with read access to file content
5. Copy the token immediately — it won't be shown again

Your token will look something like: `figd_xxxxxxxxxxxxxxxxxxxxxxxxxxxx`

> Keep your token private. "Remember token on this device" stores it in this browser's localStorage only.

## Setup

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- npm

### Installation

```bash
git clone https://github.com/Nyxlist/FigToCSS.git
cd FigToCSS
npm install
```

### Running the App

```bash
npm run dev
```

This starts the Vite dev server only. Open the URL shown in your terminal (usually `http://localhost:5173`).

The app calls the Figma API directly from the browser, so no backend is needed.

### Building for Production

```bash
npm run build
```

The output will be in the `dist/` folder.

## Usage

1. **Connect** — Load a plugin export (recommended) or connect with a file URL/key and token
2. **Select** — Browse the layer tree and check the frames/components you want to convert
3. **Settings** — Configure naming mode, layout method, and whether to include dimensions/variables
4. **Assets** — Review detected image fills and fonts, choose which to include
5. **Generate** — Preview, compare, view CSS/HTML, copy or download the CSS, or download a `.zip`

## Tech Stack

- React 18 + Vite
- Figma Plugin API (exporter in `plugin/`)
- Figma REST API (optional token mode)
- fflate (zip export)

## License

MIT
