# Figma to CSS

A web app that converts your Figma designs into clean, usable CSS. Connect your Figma file, select the layers you want, configure output settings, and generate CSS instantly.

## Features

- **Figma File Connection** — Paste a Figma file URL or file key to load your design
- **Layer Tree Browser** — Browse and select specific frames/components to convert
- **Output Settings** — Choose naming conventions, layout method (flexbox), and more
- **Asset Detection** — Identifies image and font assets used in your selection
- **CSS Generation** — Outputs ready-to-use CSS with support for variables and dimensions

## Getting Your Figma Personal Access Token

You need a Figma Personal Access Token to connect the app to your Figma files.

1. Log in to [Figma](https://www.figma.com)
2. Click your profile icon in the top-left corner and select **Settings**
3. Scroll down to the **Personal access tokens** section
4. Click **Generate new token**
5. Give your token a name (e.g. "Figma to CSS") and click **Generate token**
6. Copy the token immediately — it won't be shown again

Your token will look something like: `figd_xxxxxxxxxxxxxxxxxxxxxxxxxxxx`

> Keep your token private. Never commit it to version control.

## Setup

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- npm

### Installation

```bash
git clone https://github.com/Nyxlist/Figma-to-CSS.git
cd Figma-to-CSS
npm install
```

### Running the App

```bash
npm run dev
```

This starts both the backend proxy server (port 3001) and the Vite frontend dev server concurrently.

Open the URL shown in your terminal (usually `http://localhost:5173`).

### Building for Production

```bash
npm run build
```

The output will be in the `dist/` folder.

## Usage

1. **Connect** — Paste your Figma file URL (or file key) and your Personal Access Token, then click "Connect & Load File"
2. **Select** — Browse the layer tree and check the frames/components you want to convert
3. **Settings** — Configure naming mode, layout method, and whether to include dimensions/variables
4. **Assets** — Review detected image and font assets
5. **Generate** — View and copy the generated CSS

## Tech Stack

- React 18 + Vite (frontend)
- Express (backend proxy to Figma API)
- Figma REST API

## License

MIT
