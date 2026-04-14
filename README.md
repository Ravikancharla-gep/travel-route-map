# Travel Route Map

Interactive **India travel route planner** built with React and Vite. Plan trips with multiple stops, visualize routes on **Google Maps** or **Leaflet**, manage trip lists, and optionally sync data through a Node.js API backed by MongoDB.

## Features

- **Trip lists** — Create, reorder, and customize trips with colors and backgrounds  
- **Places & legs** — Add stops, transport modes (bus, train, car, flight, etc.), and segment details  
- **Maps** — Switch between Google Maps and OpenStreetMap (Leaflet)  
- **Auth** — Google Sign-In (when configured)  
- **Travel assistant** — Optional OpenAI-powered chat (requires `VITE_OPENAI_API_KEY`)  
- **Deploy-ready** — Static frontend can be hosted on Netlify; API runs as a separate Node service  

## Tech stack

| Layer | Technologies |
|--------|----------------|
| Frontend | React 19, TypeScript, Vite 7, Tailwind CSS, Framer Motion |
| Maps | `@react-google-maps/api`, Leaflet, `react-leaflet` |
| Backend | Express, MongoDB, JWT, Google Auth Library |

## Prerequisites

- **Node.js** 18+ and npm 8+  
- **MongoDB** (local or [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)) for full API features  
- **Google Cloud** project for Maps / Sign-In (optional but recommended for production)  

## Local development

### 1. Install dependencies

```bash
npm install
```

This runs `postinstall` and installs dependencies in `server/` as well.

### 2. Frontend environment

Create a `.env` file in the **project root** (same folder as `package.json`):

```env
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_browser_key
VITE_GOOGLE_CLIENT_ID=your_google_oauth_web_client_id.apps.googleusercontent.com
VITE_API_URL=http://localhost:3001/api
VITE_OPENAI_API_KEY=your_openai_key_optional
```

Never commit `.env` or real API keys. They are listed in `.gitignore`.

### 3. Backend environment

Create `server/.env`:

```env
PORT=3001
MONGODB_URI=mongodb://localhost:27017/route-map-india
JWT_SECRET=use_a_long_random_string_in_production
GOOGLE_CLIENT_ID=your_google_oauth_web_client_id.apps.googleusercontent.com
```

Adjust `MONGODB_URI` for Atlas (TLS connection string). Ensure your Atlas IP allowlist allows your machine (or `0.0.0.0/0` for testing).

### 4. Run the app

**Terminal A — API**

```bash
cd server
npm run dev
```

**Terminal B — Vite dev server**

```bash
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

### 5. Production build (frontend)

```bash
npm run build
npm run preview
```

Output is written to `dist/`.

## npm scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Typecheck and production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Run ESLint |
| `npm start` | Run production API (`cd server && node server.js`) after building the client |

## Deploying the frontend (Netlify)

The repo includes `netlify.toml`:

- **Build command:** `npm run build`  
- **Publish directory:** `dist`  

In the Netlify UI, set the same [environment variables](https://docs.netlify.com/environment-variables/overview/) as in the frontend `.env`, using the `VITE_` prefix. Point `VITE_API_URL` at your **deployed API** URL (not `localhost`).

**Manual deploy (drag-and-drop `dist`):** Netlify does not inject env vars into an uploaded folder. This repo includes **`.env.production`**, which Vite loads automatically when you run `npm run build`, so the built bundle contains the public API base URL. After changing that file, run `npm run build` again, then upload the new `dist` folder.

Netlify only hosts static files; the Express server in `server/` must be deployed separately (e.g. Render, Railway, Fly.io, Heroku) with its own `MONGODB_URI`, `JWT_SECRET`, and CORS settings for your site origin.

## Project structure

```
├── src/                 # React application
├── server/              # Express API + MongoDB
├── public/              # Static assets
├── dist/                # Production build (generated, not committed)
├── .env.production      # Production Vite vars (e.g. VITE_API_URL) used by `npm run build`
├── vite.config.ts
├── netlify.toml         # Netlify build & SPA redirect
└── package.json
```

## Security notes

- Rotate any API key that was ever committed or shared publicly.  
- Use environment variables and platform secrets for all keys in production.  
- Restrict Google Maps API keys by HTTP referrer (web) and enable only the APIs you need.  

## License

This project is private / use according to your organization’s policy. Add a `LICENSE` file if you want to publish under a specific open-source license.
