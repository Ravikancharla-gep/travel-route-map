import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Globe2, Layers, Map as MapViewIcon, Mountain } from 'lucide-react';
import { GoogleMap, Marker, useGoogleMap, useJsApiLoader } from '@react-google-maps/api';
import type { Place, TripList, TransportMode } from '../types';

/** Click transport marker on map: cycle through these modes (then back to start). */
const MAP_TRANSPORT_CYCLE: TransportMode[] = ['Bike', 'Car', 'Bus', 'Train', 'Flight'];

function nextCycledMapTransport(current?: string): TransportMode {
  const cur = (current as TransportMode) || 'Car';
  const i = MAP_TRANSPORT_CYCLE.indexOf(cur);
  const next = i >= 0 ? (i + 1) % MAP_TRANSPORT_CYCLE.length : 0;
  return MAP_TRANSPORT_CYCLE[next];
}

// Map container style
const mapContainerStyle = {
  width: '100%',
  height: '100%',
};

// Libraries to load
const libraries: ("places" | "drawing" | "geometry" | "visualization")[] = ["places", "geometry"];

/** Match map fit control in App.tsx: p-3 + 18px icon ≈ 42px row, rounded-lg, bg-black/55, shadow-lg. */
const MAP_TOOLBAR_MIN_H = 'min-h-[42px]';
const MAP_VIEWS_STRIP_PX = 260;

const MAP_VIEW_CHOICES = [
  { id: 'roadmap', label: 'Road', Icon: MapViewIcon },
  { id: 'terrain', label: 'Terrain', Icon: Mountain },
  { id: 'satellite', label: 'Satellite', Icon: Globe2 },
  { id: 'hybrid', label: 'Hybrid', Icon: Layers },
] as const;

/** Compact “Views” control: hover (or focus) slides open four basemap options; closes on pick, pointer leave (unless focus-within), outside press, or Escape. */
function MapViewsSlideControl({
  mapTypeId,
  onChange,
}: {
  mapTypeId: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onDoc, true);
    return () => document.removeEventListener('pointerdown', onDoc, true);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const closeIfPointerLeave = () => {
    requestAnimationFrame(() => {
      const el = rootRef.current;
      if (el && !el.matches(':focus-within')) setOpen(false);
    });
  };

  const pick =
    (id: string) =>
    (e: React.MouseEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      onChange(id);
      setOpen(false);
    };

  const optBase = `flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-0 text-[9px] font-bold uppercase leading-tight tracking-wide text-white/85 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/40 ${MAP_TOOLBAR_MIN_H}`;
  const optOn = 'bg-black/45 text-white ring-1 ring-inset ring-white/15';
  const optOff = 'bg-black/25 hover:bg-black/40 hover:text-white';

  return (
    <div
      ref={rootRef}
      className="pointer-events-auto flex select-none items-stretch overflow-hidden rounded-lg bg-black/55 text-white shadow-lg transition-colors hover:bg-black/65"
      onPointerDown={(e) => {
        e.stopPropagation();
        if (e.pointerType !== 'mouse') setOpen(true);
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={closeIfPointerLeave}
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={(e) => {
        const next = e.relatedTarget as Node | null;
        if (next && rootRef.current?.contains(next)) return;
        setOpen(false);
      }}
    >
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls="map-views-strip"
        className={`flex shrink-0 items-center gap-2 p-3 text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent ${MAP_TOOLBAR_MIN_H} ${
          open ? 'bg-black/35' : ''
        }`}
      >
        <Layers size={18} className="shrink-0" strokeWidth={2} aria-hidden />
        <span className="whitespace-nowrap text-xs font-semibold">Views</span>
        {open ? (
          <ChevronLeft size={16} className="shrink-0 opacity-80" aria-hidden />
        ) : (
          <ChevronRight size={16} className="shrink-0 opacity-80" aria-hidden />
        )}
      </button>

      <motion.div
        id="map-views-strip"
        role="group"
        aria-label="Basemap"
        initial={false}
        animate={{ width: open ? MAP_VIEWS_STRIP_PX : 0 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        className="shrink-0 overflow-hidden border-l border-black/40 bg-black/55"
      >
        <div className={`flex bg-black/55 ${MAP_TOOLBAR_MIN_H}`} style={{ width: MAP_VIEWS_STRIP_PX }}>
          {MAP_VIEW_CHOICES.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={pick(id)}
              className={`${optBase} ${mapTypeId === id ? optOn : optOff}`}
            >
              <Icon size={16} className="shrink-0 opacity-95" strokeWidth={2} aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Safe hex color for inline CSS (trip list colors). */
function sanitizeHexColor(color: string, fallback: string): string {
  const c = color.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(c) || /^#[0-9A-Fa-f]{3}$/.test(c)) return c;
  return fallback;
}

/** Styled HTML for Google Maps InfoWindow (route leg: distance / time). */
function buildRouteLegInfoHtml(opts: {
  tripColor: string;
  fromNameEsc: string;
  toNameEsc: string;
  distanceValueEsc: string;
  timeValueEsc: string;
}): string {
  const { tripColor, fromNameEsc, toNameEsc, distanceValueEsc, timeValueEsc } = opts;
  const bar = sanitizeHexColor(tripColor, '#0d9488');
  return `
<div style="box-sizing:border-box;margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;min-width:275px;max-width:300px;border-radius:10px;overflow:hidden;box-shadow:0 8px 24px rgba(15,23,42,0.12),0 0 0 1px rgba(148,163,184,0.2);background:#ffffff">
  <div style="height:3px;background:${bar};width:100%"></div>
  <div style="box-sizing:border-box;padding:12px 16px 14px 16px">
    <div style="font-size:13px;font-weight:700;color:#0f172a;line-height:1.35;margin-bottom:10px;letter-spacing:-0.02em;text-align:center;width:100%">${fromNameEsc}<span style="color:#94a3b8;font-weight:500;margin:0 4px">→</span>${toNameEsc}</div>
    <div style="display:flex;gap:8px;align-items:stretch">
      <div style="flex:1;min-width:0;box-sizing:border-box;background:#f1f5f9;border-radius:8px;padding:8px 10px;border:1px solid #e2e8f0">
        <div style="font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;margin-bottom:3px">Distance</div>
        <div style="font-size:13px;font-weight:700;color:#1e293b;line-height:1.25;white-space:nowrap">${distanceValueEsc}</div>
      </div>
      <div style="flex:1;min-width:0;box-sizing:border-box;background:#f1f5f9;border-radius:8px;padding:8px 10px;border:1px solid #e2e8f0">
        <div style="font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;margin-bottom:3px">Time</div>
        <div style="font-size:13px;font-weight:700;color:#1e293b;line-height:1.25;white-space:nowrap">${timeValueEsc}</div>
      </div>
    </div>
  </div>
</div>`.trim();
}

/** Map list transport to Google Directions travel mode (with DRIVING fallback in the caller when needed). */
function transportToTravelMode(transport?: string): google.maps.TravelMode {
  const t = (transport || 'Car').toLowerCase();
  if (t.includes('walk')) return google.maps.TravelMode.WALKING;
  if (t.includes('bike') || t.includes('bicycle')) return google.maps.TravelMode.BICYCLING;
  if (t.includes('bus') || t.includes('train')) return google.maps.TravelMode.TRANSIT;
  return google.maps.TravelMode.DRIVING;
}

// Get transport icon emoji
const getTransportEmoji = (transport?: string): string => {
  if (!transport) return '🚗';
  const transportLower = transport.toLowerCase();
  if (transportLower.includes('train')) return '🚂';
  if (transportLower.includes('bus')) return '🚌';
  if (transportLower.includes('flight') || transportLower.includes('plane')) return '✈️';
  if (transportLower.includes('bike')) return '🏍️';
  if (transportLower.includes('walk')) return '🚶';
  if (transportLower.includes('boat')) return '🚢';
  return '🚗'; // Default to car
};

function buildMarkerIcon(
  place: Place,
  tripColor: string,
  selectedPlaceId: string | null,
  hoveredPlaceId: string | null,
  options?: { simpleDot?: boolean },
): google.maps.Icon | undefined {
  if (typeof google === 'undefined' || !google.maps) {
    return undefined;
  }
  const markerColor =
    selectedPlaceId === place.id
      ? '#EF4444'
      : hoveredPlaceId === place.id
        ? '#F97316'
        : tripColor;

  // India / all-trips view: only small dots, never sequence numbers.
  const displayNumber = options?.simpleDot ? undefined : place.assignedNumber;

  if (displayNumber === undefined) {
    const svg = `
        <svg width="16" height="16" xmlns="http://www.w3.org/2000/svg">
          <circle cx="8" cy="8" r="7" fill="${markerColor}" stroke="#FFFFFF" stroke-width="2"/>
        </svg>
      `;
    return {
      url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
      scaledSize: new google.maps.Size(16, 16),
      anchor: new google.maps.Point(8, 8),
    };
  }
  const svg = `
        <svg width="28" height="28" xmlns="http://www.w3.org/2000/svg">
          <circle cx="14" cy="14" r="13" fill="${markerColor}" stroke="#FFFFFF" stroke-width="2"/>
          <text x="14" y="18" font-size="12" font-weight="700" text-anchor="middle" fill="#FFFFFF">${displayNumber}</text>
        </svg>
      `;
  return {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
    scaledSize: new google.maps.Size(28, 28),
    anchor: new google.maps.Point(14, 14),
  };
}

/** Imperative overlays + guaranteed cleanup when switching trips (avoids stale Polylines from react-google-maps/api). */
// Rebuilds markers/polylines only when trip geometry or transport visibility changes — not on selectedPlaceId (icons update in a separate effect).
function SelectedTripMapLayer({
  trip,
  selectedPlaceId,
  hoveredPlaceId,
  showTransportOnMap,
  onMarkerClick,
  onMarkerHover,
  onLegTransportChange,
  markerRefs,
}: {
  trip: TripList;
  selectedPlaceId: string | null;
  hoveredPlaceId: string | null;
  showTransportOnMap: boolean;
  onMarkerClick: (placeId: string) => void;
  onMarkerHover: (placeId: string | null, place?: Place) => void;
  onLegTransportChange?: (toPlaceId: string, transport: TransportMode) => void;
  markerRefs: React.MutableRefObject<Record<string, unknown>>;
}) {
  const map = useGoogleMap();
  const handlersRef = useRef({ onMarkerClick, onMarkerHover });
  handlersRef.current = { onMarkerClick, onMarkerHover };
  const onLegTransportChangeRef = useRef(onLegTransportChange);
  onLegTransportChangeRef.current = onLegTransportChange;
  const selectedPlaceIdRef = useRef(selectedPlaceId);
  selectedPlaceIdRef.current = selectedPlaceId;

  const placesKey = trip.places
    .map(
      (p) =>
        `${p.id}:${p.coords[0]},${p.coords[1]}:${p.assignedNumber ?? ''}:${p.isIntermediate ? 'i' : ''}:${p.transport ?? ''}`,
    )
    .join('|');

  useLayoutEffect(() => {
    if (!map || typeof google === 'undefined' || !google.maps) return;

    const selId = selectedPlaceIdRef.current;

    const markers: google.maps.Marker[] = [];
    const polylines: google.maps.Polyline[] = [];
    const listeners: google.maps.MapsEventListener[] = [];
    const infoWindow = new google.maps.InfoWindow({
      maxWidth: 320,
      // Nudge bubble above the transport icon so it’s less likely to cover the hit circle and fire a spurious mouseout.
      pixelOffset: new google.maps.Size(0, -12),
    });
    const directionsService = new google.maps.DirectionsService();
    const routeLegDisplayCache = new Map<
      string,
      { distanceValueEsc: string; timeValueEsc: string }
    >();
    let routeLegFetchSerial = 0;

    /** Bumped on mouseout, transport click, map click, and effect cleanup so stale Directions callbacks cannot reopen the popup. */
    let routeLegPopupSession = 0;
    /** Popup is marker-hover only: do not keep it open when the pointer moves over the InfoWindow. */
    const invalidateRouteLegSession = () => {
      routeLegPopupSession += 1;
      infoWindow.close();
    };

    listeners.push(
      infoWindow.addListener('domready', () => {
        document.querySelectorAll('.gm-style-iw-c, .gm-style-iw-d, .gm-style-iw-ch').forEach((node) => {
          const el = node as HTMLElement;
          el.style.pointerEvents = 'none';
        });
        document.querySelectorAll('.gm-style-iw button').forEach((btn) => {
          const b = btn as HTMLElement;
          b.style.display = 'none';
          b.style.visibility = 'hidden';
        });
      }),
      map.addListener('click', () => {
        invalidateRouteLegSession();
      }),
    );

    trip.places.forEach((place, index) => {
      const icon = buildMarkerIcon(place, trip.color, selId, null);
      if (!icon) return;

      const marker = new google.maps.Marker({
        map,
        position: { lat: place.coords[0], lng: place.coords[1] },
        icon,
        optimized: true,
      });
      markers.push(marker);
      markerRefs.current[place.id] = marker;

      listeners.push(
        marker.addListener('click', () => handlersRef.current.onMarkerClick(place.id)),
        marker.addListener('mouseover', () => {
          if (selectedPlaceIdRef.current !== place.id) handlersRef.current.onMarkerHover(place.id, place);
        }),
        marker.addListener('mouseout', () => {
          if (selectedPlaceIdRef.current !== place.id) handlersRef.current.onMarkerHover(null);
        }),
      );

      if (index > 0) {
        const poly = new google.maps.Polyline({
          map,
          path: [
            { lat: trip.places[index - 1].coords[0], lng: trip.places[index - 1].coords[1] },
            { lat: place.coords[0], lng: place.coords[1] },
          ],
          strokeColor: trip.color,
          strokeWeight: 4,
          strokeOpacity: 0.7,
          icons: [
            {
              icon: {
                path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                scale: 4,
                strokeColor: trip.color,
                fillColor: trip.color,
                fillOpacity: 0.9,
              },
              offset: '50%',
              repeat: '100px',
            },
          ],
        });
        polylines.push(poly);
      }

      if (showTransportOnMap && index > 0) {
        const fromPlace = trip.places[index - 1];
        const toPlace = place;
        const midLat = (fromPlace.coords[0] + toPlace.coords[0]) / 2;
        const midLng = (fromPlace.coords[1] + toPlace.coords[1]) / 2;
        // Hit area: circle only (SVG is 60×60 but corners are transparent; without `shape` the whole square gets hover).
        // cx=30 cy=30 r=20 + stroke 3 → outer radius ≈21.5; use 22px so hover matches visible disc including white ring.
        const tMarker = new google.maps.Marker({
          map,
          position: { lat: midLat, lng: midLng },
          icon: {
            url:
              'data:image/svg+xml;charset=UTF-8,' +
              encodeURIComponent(`
              <svg width="60" height="60" xmlns="http://www.w3.org/2000/svg">
                <circle cx="30" cy="30" r="20" fill="${trip.color}" stroke="#FFFFFF" stroke-width="3"/>
                <text x="30" y="38" font-size="24" text-anchor="middle">${getTransportEmoji(toPlace.transport)}</text>
              </svg>
            `),
            scaledSize: new google.maps.Size(60, 60),
            anchor: new google.maps.Point(30, 30),
          },
          shape: { type: 'circle', coords: [30, 30, 22] },
          optimized: true,
          zIndex: 1000,
        });
        markers.push(tMarker);

        listeners.push(
          tMarker.addListener('click', () => {
            invalidateRouteLegSession();
            const next = nextCycledMapTransport(toPlace.transport);
            onLegTransportChangeRef.current?.(toPlace.id, next);
          }),
        );

        const openRouteLegPopup = (session: number) => {
            if (session !== routeLegPopupSession) return;
            const origin = new google.maps.LatLng(fromPlace.coords[0], fromPlace.coords[1]);
            const destination = new google.maps.LatLng(toPlace.coords[0], toPlace.coords[1]);
            const primaryMode = transportToTravelMode(toPlace.transport);
            const legCacheKey = `${fromPlace.id}|${toPlace.id}|${toPlace.transport ?? ''}`;

            const cached = routeLegDisplayCache.get(legCacheKey);
            if (cached) {
              if (session !== routeLegPopupSession) return;
              infoWindow.setContent(
                buildRouteLegInfoHtml({
                  tripColor: trip.color,
                  fromNameEsc: escapeHtml(fromPlace.name),
                  toNameEsc: escapeHtml(toPlace.name),
                  distanceValueEsc: cached.distanceValueEsc,
                  timeValueEsc: cached.timeValueEsc,
                }),
              );
              infoWindow.setPosition({ lat: midLat, lng: midLng });
              if (session !== routeLegPopupSession) return;
              infoWindow.open({ map, anchor: tMarker });
              return;
            }

            const fetchSerial = ++routeLegFetchSerial;
            const commitLegDisplay = (distanceValueEsc: string, timeValueEsc: string) => {
              if (fetchSerial !== routeLegFetchSerial) return;
              if (session !== routeLegPopupSession) return;
              routeLegDisplayCache.set(legCacheKey, { distanceValueEsc, timeValueEsc });
              infoWindow.setContent(
                buildRouteLegInfoHtml({
                  tripColor: trip.color,
                  fromNameEsc: escapeHtml(fromPlace.name),
                  toNameEsc: escapeHtml(toPlace.name),
                  distanceValueEsc,
                  timeValueEsc,
                }),
              );
              infoWindow.setPosition({ lat: midLat, lng: midLng });
              if (session !== routeLegPopupSession) return;
              infoWindow.open({ map, anchor: tMarker });
            };

            const showStraightLine = () => {
              const meters = google.maps.geometry.spherical.computeDistanceBetween(origin, destination);
              const km = (meters / 1000).toFixed(1);
              const hoursRough = meters / 1000 / 45;
              const timeRough =
                hoursRough >= 1
                  ? `${hoursRough.toFixed(1)} hrs (approx.)`
                  : `${Math.max(1, Math.round(hoursRough * 60))} min (approx.)`;
              const distHtml = `${km} km<span style="font-size:11px;font-weight:600;color:#64748b;margin-left:4px">(line)</span>`;
              commitLegDisplay(distHtml, escapeHtml(timeRough));
            };

            const showLegResult = (distText: string, durText: string) => {
              commitLegDisplay(escapeHtml(distText), escapeHtml(durText));
            };

            const requestRoute = (
              mode: google.maps.TravelMode,
              afterFail?: () => void,
            ) => {
              const request: google.maps.DirectionsRequest = {
                origin,
                destination,
                travelMode: mode,
                region: 'IN',
              };
              if (mode === google.maps.TravelMode.TRANSIT) {
                request.transitOptions = { departureTime: new Date() };
              }
              directionsService.route(request, (result, status) => {
                if (status === 'OK' && result?.routes?.[0]?.legs?.[0]) {
                  const leg = result.routes[0].legs[0];
                  const distText = leg.distance?.text ?? '';
                  const durText = leg.duration?.text ?? '';
                  if (distText && durText) {
                    showLegResult(distText, durText);
                    return;
                  }
                }
                if (afterFail) afterFail();
                else showStraightLine();
              });
            };

            if (primaryMode === google.maps.TravelMode.TRANSIT) {
              requestRoute(google.maps.TravelMode.TRANSIT, () => {
                requestRoute(google.maps.TravelMode.DRIVING, () => {
                  showStraightLine();
                });
              });
            } else {
              requestRoute(primaryMode, () => {
                if (primaryMode !== google.maps.TravelMode.DRIVING) {
                  requestRoute(google.maps.TravelMode.DRIVING, () => {
                    showStraightLine();
                  });
                } else {
                  showStraightLine();
                }
              });
            }
        };

        listeners.push(
          tMarker.addListener('mouseover', () => {
            invalidateRouteLegSession();
            const session = routeLegPopupSession;
            openRouteLegPopup(session);
          }),
          tMarker.addListener('mouseout', () => {
            invalidateRouteLegSession();
          }),
        );
      }
    });

    return () => {
      invalidateRouteLegSession();
      listeners.forEach((l) => {
        l.remove();
      });
      markers.forEach((m) => {
        google.maps.event.clearInstanceListeners(m);
        m.setMap(null);
      });
      polylines.forEach((p) => {
        google.maps.event.clearInstanceListeners(p);
        p.setMap(null);
      });
      trip.places.forEach((p) => {
        delete markerRefs.current[p.id];
      });
    };
  }, [map, trip.id, trip.color, placesKey, showTransportOnMap, markerRefs]);

  // Apply hover/selection marker colors without recreating markers (recreation prevented reliable mouseout).
  useEffect(() => {
    if (!map || typeof google === 'undefined' || !google.maps) return;
    trip.places.forEach((place) => {
      const marker = markerRefs.current[place.id] as google.maps.Marker | undefined;
      if (!marker) return;
      const icon = buildMarkerIcon(place, trip.color, selectedPlaceId, hoveredPlaceId);
      if (icon) marker.setIcon(icon);
    });
  }, [map, trip.color, placesKey, selectedPlaceId, hoveredPlaceId, markerRefs]);

  return null;
}

interface GoogleMapWrapperProps {
  center: [number, number];
  zoom: number;
  selectedTrip: TripList | null;
  showAllTrips: boolean;
  /** When true with !showAllTrips, draw no route markers (India overview only). */
  hideAllMapMarkers?: boolean;
  tripLists: TripList[];
  selectedPlaceId: string | null;
  hoveredPlaceId: string | null;
  showTransportOnMap: boolean;
  fitBoundsActive: boolean;
  onMapClick: () => void;
  onMarkerClick: (placeId: string) => void;
  onMarkerHover: (placeId: string | null, place?: Place) => void;
  onFitBoundsComplete: () => void;
  markerRefs: React.MutableRefObject<{ [key: string]: any }>;
  onLegTransportChange?: (toPlaceId: string, transport: TransportMode) => void;
}

const GoogleMapWrapper: React.FC<GoogleMapWrapperProps> = ({
  center,
  zoom,
  selectedTrip,
  showAllTrips,
  hideAllMapMarkers = false,
  tripLists,
  selectedPlaceId,
  hoveredPlaceId,
  showTransportOnMap,
  fitBoundsActive,
  onMapClick,
  onMarkerClick,
  onMarkerHover,
  onFitBoundsComplete,
  markerRefs,
  onLegTransportChange,
}) => {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
  const mapRef = useRef<google.maps.Map | null>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  // Keep hook order stable across loading/error states.
  const [initialCenter] = useState<{ lat: number; lng: number }>({ lat: center[0], lng: center[1] });
  const [initialZoom] = useState<number>(zoom);
  /** App-controlled map type so Terrain / Satellite stay visible above other map chrome (native control can be hard to see). */
  const [mapTypeIdUi, setMapTypeIdUi] = useState<string>('roadmap');
  /** Pegman / fullscreen Street View — hide custom Views and map pegman so they don’t sit on top of live view. */
  const [streetViewOpen, setStreetViewOpen] = useState(false);

  /** GoogleMap (PureComponent) re-registers every listener/updater when any prop reference changes — unstable App callbacks were causing huge work on hover/zoom. */
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;
  const onFitBoundsCompleteRef = useRef(onFitBoundsComplete);
  onFitBoundsCompleteRef.current = onFitBoundsComplete;

  const handleMapLoad = useCallback((m: google.maps.Map) => {
    mapRef.current = m;
    setMap(m);
    const id = m.getMapTypeId();
    if (id) setMapTypeIdUi(id);
  }, []);

  const handleMapUnmount = useCallback(() => {
    mapRef.current = null;
    setMap(null);
  }, []);

  const handleMapTypeIdChanged = useCallback(() => {
    const m = mapRef.current;
    if (m) {
      const id = m.getMapTypeId();
      if (id) setMapTypeIdUi(id);
    }
  }, []);

  const handleMapClick = useCallback((_e: google.maps.MapMouseEvent) => {
    onMapClickRef.current();
  }, []);

  // Stable options + mapTypeId in one object — a new inline `options` every render was calling setOptions() constantly and could prevent map type from sticking.
  const mapOptions = useMemo((): google.maps.MapOptions => {
    const bottomCenter =
      typeof google !== 'undefined' && google.maps
        ? google.maps.ControlPosition.BOTTOM_CENTER
        : (11 as google.maps.ControlPosition);
    return {
      disableDefaultUI: true,
      zoomControl: false,
      mapTypeControl: false,
      scaleControl: false,
      streetViewControl: !streetViewOpen,
      streetViewControlOptions: {
        position: bottomCenter,
      },
      rotateControl: false,
      fullscreenControl: false,
      cameraControl: false,
      gestureHandling: 'greedy',
      minZoom: 3,
      maxZoom: 18,
      styles: [
        {
          featureType: 'poi',
          elementType: 'labels',
          stylers: [{ visibility: 'off' }],
        },
      ],
      scrollwheel: !streetViewOpen,
      mapTypeId: mapTypeIdUi,
    };
  }, [mapTypeIdUi, streetViewOpen]);

  // Load Google Maps
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: apiKey,
    libraries,
    // Prefer English map labels and controls (reduces local-script regional names where the API supports it).
    language: 'en',
  });

  // Log API key status (first 10 chars only for security)
  useEffect(() => {
    if (apiKey) {
      console.log('Google Maps API Key loaded:', apiKey.substring(0, 10) + '...');
    } else {
      console.error('Google Maps API Key is missing!');
    }
    if (loadError) {
      console.error('Google Maps load error:', loadError);
    }
  }, [apiKey, loadError]);

  // Apply map type on the live instance (covers any mismatch with @react-google-maps prop updates).
  useEffect(() => {
    if (!map) return;
    const current = map.getMapTypeId();
    if (current !== mapTypeIdUi) {
      map.setMapTypeId(mapTypeIdUi);
    }
  }, [map, mapTypeIdUi]);

  // Street View uses its own UI (zoom, compass, fullscreen, address bar). MapOptions.disableDefaultUI does not
  // affect it — those controls default to bottom-right / top-left and overlap app chrome (profile, chatbot, etc.).
  useEffect(() => {
    if (!map || typeof google === 'undefined' || !google.maps) return;
    const panorama = map.getStreetView();
    const streetViewUi: google.maps.StreetViewPanoramaOptions = {
      disableDefaultUI: true,
      enableCloseButton: true,
      clickToGo: true,
      scrollwheel: false,
    };
    const sync = () => {
      const visible = panorama.getVisible();
      setStreetViewOpen(visible);
      if (visible) panorama.setOptions(streetViewUi);
    };
    panorama.setOptions(streetViewUi);
    sync();
    const listener = panorama.addListener('visible_changed', sync);
    return () => {
      google.maps.event.removeListener(listener);
    };
  }, [map]);

  // Track if we've already fitted bounds to prevent unnecessary repositioning
  const hasFittedRef = useRef(false);
  const previousFitBoundsActive = useRef(false);

  // Handle fit bounds - only when fitBoundsActive changes from false to true
  useEffect(() => {
    if (!map) return;
    
    // Only trigger fit bounds when fitBoundsActive becomes true (button clicked)
    // Check if it's a new activation (was false, now true)
    const isNewActivation = fitBoundsActive && !previousFitBoundsActive.current;
    
    if (isNewActivation) {
      const fitIndia = () => {
        const bounds = new google.maps.LatLngBounds();
        bounds.extend({ lat: 6.5, lng: 68.1 }); // Southwest corner of India
        bounds.extend({ lat: 35.5, lng: 97.4 }); // Northeast corner of India
        map.fitBounds(bounds);
        hasFittedRef.current = true;
        onFitBoundsCompleteRef.current();
      };

      if (showAllTrips) {
        fitIndia();
      } else if (hideAllMapMarkers) {
        fitIndia();
      } else if (selectedTrip && selectedTrip.places.length > 0) {
        // Fit to selected trip bounds - include ALL places (both numbered and intermediate)
        const bounds = new google.maps.LatLngBounds();

        selectedTrip.places.forEach((place) => {
          bounds.extend({ lat: place.coords[0], lng: place.coords[1] });
        });

        map.fitBounds(bounds);
        const currentZoom = map.getZoom() || 10;
        if (currentZoom > 15) {
          map.setZoom(15);
        }
        hasFittedRef.current = true;
        onFitBoundsCompleteRef.current();
      } else if (selectedTrip && selectedTrip.places.length === 0) {
        // Empty list: same India framing as the sidebar India / "all trips" view (no showAllTrips toggle)
        fitIndia();
      }
    }
    
    // Track previous state
    previousFitBoundsActive.current = fitBoundsActive;
    
    // Reset when fitBoundsActive becomes false
    if (!fitBoundsActive) {
      hasFittedRef.current = false;
    }
  }, [map, fitBoundsActive, showAllTrips, hideAllMapMarkers, selectedTrip]);

  if (loadError) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-gray-100">
        <div className="text-center p-4">
          <p className="text-red-600 font-semibold">Error loading Google Maps</p>
          <p className="text-gray-600 text-sm mt-2">Please check your API key and network connection</p>
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-gray-600 mt-4">Loading Google Maps...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full min-h-0 min-w-0">
      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        // Use initial values - GoogleMap will manage its own state after load
        center={initialCenter}
        zoom={initialZoom}
        options={mapOptions}
        onLoad={handleMapLoad}
        onUnmount={handleMapUnmount}
        onMapTypeIdChanged={handleMapTypeIdChanged}
        onClick={handleMapClick}
      >
      {/* Render markers and routes - only if map is loaded */}
      {isLoaded && typeof google !== 'undefined' && google.maps && showAllTrips ? (
        // Show all trips mode - just dots, no numbers, no lines
        tripLists.map((trip) =>
          trip.places.map((place) => {
            const icon = buildMarkerIcon(place, trip.color, selectedPlaceId, hoveredPlaceId, {
              simpleDot: true,
            });
            if (!icon) return null;
            return (
            <Marker
              key={`${trip.id}:${place.id}`}
              position={{ lat: place.coords[0], lng: place.coords[1] }}
              icon={icon}
              options={{ optimized: true }}
              onMouseOver={() => onMarkerHover(place.id, place)}
              onMouseOut={() => onMarkerHover(null)}
              onClick={() => onMarkerClick(place.id)}
              ref={(instance) => {
                if (instance) {
                  markerRefs.current[place.id] = instance;
                }
              }}
            />
            );
          })
        )
      ) : isLoaded && typeof google !== 'undefined' && google.maps && selectedTrip && !hideAllMapMarkers ? (
          <SelectedTripMapLayer
            trip={selectedTrip}
            selectedPlaceId={selectedPlaceId}
            hoveredPlaceId={hoveredPlaceId}
            showTransportOnMap={showTransportOnMap}
            onMarkerClick={onMarkerClick}
            onMarkerHover={onMarkerHover}
            onLegTransportChange={onLegTransportChange}
            markerRefs={markerRefs}
          />
      ) : null}
      </GoogleMap>

      {!streetViewOpen ? (
        <div
          className="pointer-events-auto absolute left-[5.25rem] top-4 z-[10050]"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <MapViewsSlideControl mapTypeId={mapTypeIdUi} onChange={setMapTypeIdUi} />
        </div>
      ) : null}
    </div>
  );
};

export default GoogleMapWrapper;

