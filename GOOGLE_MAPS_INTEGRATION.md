# Google Maps Integration Guide

## Current Setup
- **Map Provider**: ArcGIS World Street Map (not Google Maps)
- **Library**: Leaflet/React-Leaflet
- **Street View**: ❌ Not implemented

## What You Need to Use Google Maps

### ✅ 1. API Key (You Already Have!)
- Key: `AIzaSyBys9UTr5qkse8UZE88IuNdvx_b8SL6rbE`
- Already in `.env` as `VITE_GOOGLE_MAPS_API_KEY`

### ✅ 2. Enable Required APIs

Go to [Google Cloud Console](https://console.cloud.google.com/):
1. Select your project
2. Go to "APIs & Services" > "Library"
3. Enable these APIs:
   - ✅ **Maps JavaScript API** (for the map)
   - ✅ **Street View Static API** (for Street View images)
   - ✅ **Street View Panorama API** (for interactive Street View)
   - ✅ **Places API** (already enabled - for images/search)

### ✅ 3. Install Google Maps Library

**Option A: @react-google-maps/api** (Most Popular)
```bash
npm install @react-google-maps/api
```

**Option B: @vis.gl/react-google-maps** (Newer, More Features)
```bash
npm install @vis.gl/react-google-maps
```

### ✅ 4. Code Changes Required

**Current Code (Leaflet)**:
```tsx
import { MapContainer, TileLayer, Marker } from 'react-leaflet';

<MapContainer>
  <TileLayer url="https://server.arcgisonline.com/..." />
  <Marker position={[lat, lng]} />
</MapContainer>
```

**New Code (Google Maps)**:
```tsx
import { GoogleMap, LoadScript, Marker } from '@react-google-maps/api';

<LoadScript googleMapsApiKey={apiKey}>
  <GoogleMap center={[lat, lng]} zoom={10}>
    <Marker position={{ lat, lng }} />
  </GoogleMap>
</LoadScript>
```

## Migration Considerations

### Pros of Switching to Google Maps:
✅ **Street View** - Full interactive Street View
✅ **Better Quality** - Higher resolution tiles
✅ **Better Performance** - Optimized rendering
✅ **More Features** - Directions, traffic, etc.
✅ **Better Mobile** - Optimized for mobile devices

### Cons:
❌ **Requires Migration** - Need to rewrite map components
❌ **Different API** - Different component structure
❌ **Cost** - Google Maps has usage limits (but you have free tier)
❌ **Larger Bundle** - Google Maps library is larger

## Street View Integration

Once Google Maps is integrated, you can add Street View:

```tsx
import { StreetViewPanorama } from '@react-google-maps/api';

<StreetViewPanorama
  position={{ lat, lng }}
  visible={true}
/>
```

## Quick Start Option

**Option 1: Keep Leaflet + Add Google Street View** (Easier)
- Keep current Leaflet map
- Add Google Street View as a separate component
- Minimal code changes

**Option 2: Full Migration to Google Maps** (Better, but more work)
- Replace all Leaflet components
- Get full Google Maps + Street View
- Better long-term solution

## Recommendation

Since you already have:
- ✅ API key
- ✅ Google Maps API access
- ✅ Working Leaflet map

**I recommend**: 
1. **Start with Option 1** - Add Street View as overlay/separate component
2. **Later migrate to Option 2** - Full Google Maps integration

Would you like me to:
- **A)** Add Street View to existing Leaflet map (quick)
- **B)** Migrate to full Google Maps (more work, better result)

---

**Cost**: Google Maps JavaScript API is free for most usage (up to $200/month credit)

