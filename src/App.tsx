import { useState, useEffect, useRef, useMemo } from 'react';
import GoogleMapWrapper from './components/GoogleMapWrapper';
import { motion, AnimatePresence } from 'framer-motion';
import { Maximize2, LogIn, LogOut, User } from 'lucide-react';

import type { AppState, TripList, Place, TransportMode } from './types';
import { SAMPLE_KERALA_TRIP, TRIP_COLORS } from './types';
// Use API-based storage (with localStorage fallback)
import { storageUtils } from './utils/storageApi';
import { authUtils, type User as AuthUser } from './utils/auth';
import { fetchPlaceImage } from './utils/placeImageFetcher';
import Sidebar from './components/Sidebar';
import PlacePopup from './components/PlacePopup';
import ImageModal from './components/ImageModal';
import TravelChatbot, { TRAVEL_CHATBOT_PANEL_HEIGHT_PX } from './components/TravelChatbot';
import AuthModal from './components/AuthModal';

// Marker creation functions removed - now handled in GoogleMapWrapper component

/**
 * Assign 1…N to non-intermediate stops in list order.
 * Intermediate rows linked with originalPlaceId (revisits) keep the same display number as that stop.
 * Other intermediates have no assignedNumber.
 */
function renumberTripPlaces(places: Place[]): Place[] {
  let numberCounter = 1;
  const withSequential = places.map((p) => {
    if (p.isIntermediate) {
      return { ...p };
    }
    return { ...p, assignedNumber: numberCounter++ };
  });

  return withSequential.map((p) => {
    if (!p.isIntermediate) {
      return p;
    }
    if (p.originalPlaceId) {
      const origin = withSequential.find((op) => op.id === p.originalPlaceId);
      return {
        ...p,
        assignedNumber: origin?.assignedNumber ?? p.assignedNumber,
      };
    }
    // Legacy rows: intermediate with a stored number but no originalPlaceId (keep display)
    if (p.assignedNumber != null) {
      return { ...p };
    }
    return { ...p, assignedNumber: undefined };
  });
}

function withRenumberedPlaces(trip: TripList): TripList {
  const rawPlaces = Array.isArray(trip.places) ? trip.places : [];
  return { ...trip, places: renumberTripPlaces([...rawPlaces]) };
}

/** When the API returns no lists, restore from the same localStorage key used as save fallback. */
function readTripListsFromLocalStorage(): Partial<AppState> | null {
  try {
    const localData = localStorage.getItem('route-map-india-data');
    if (!localData) return null;
    const parsed = JSON.parse(localData) as unknown;
    if (Array.isArray(parsed) && parsed.length > 0) {
      return {
        tripLists: parsed as TripList[],
        selectedTripId: (parsed[0] as TripList)?.id ?? null,
      };
    }
    if (
      parsed &&
      typeof parsed === 'object' &&
      'tripLists' in parsed &&
      Array.isArray((parsed as { tripLists: unknown }).tripLists) &&
      (parsed as { tripLists: TripList[] }).tripLists.length > 0
    ) {
      const p = parsed as Partial<AppState>;
      return {
        tripLists: p.tripLists,
        selectedTripId: p.selectedTripId ?? p.tripLists![0]?.id ?? null,
        mapState: p.mapState,
        headerImages: p.headerImages,
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

function normalizeTripLists(lists: TripList[]): TripList[] {
  return lists.map((t) => ({
    ...t,
    places: Array.isArray(t.places) ? t.places : [],
  }));
}

function resolveSelectedTripId(lists: TripList[], preferred: string | null | undefined): string | null {
  if (lists.length === 0) return null;
  if (preferred && lists.some((t) => t.id === preferred)) return preferred;
  return lists[0]?.id ?? null;
}

// Initialize state - now async to load from API (only if authenticated)
const getInitialState = async (): Promise<AppState> => {
  // Only load from API if user is authenticated
  if (!authUtils.isAuthenticated()) {
    console.log('User not authenticated, using sample data');
    return {
      tripLists: [withRenumberedPlaces(SAMPLE_KERALA_TRIP)],
      selectedTripId: SAMPLE_KERALA_TRIP.id,
      mapState: {
        center: [20.5937, 78.9629],
        zoom: 6,
      },
      isAddPlaceModalOpen: false,
      hoveredPlace: null,
      headerImages: [],
    };
  }

  const defaultMap = {
    center: [20.5937, 78.9629] as [number, number],
    zoom: 6,
  };

  try {
    const savedState = await storageUtils.loadAppState();
    let tripLists = normalizeTripLists(savedState.tripLists ?? []);
    let mergedLocal: Partial<AppState> | null = null;

    if (tripLists.length === 0) {
      mergedLocal = readTripListsFromLocalStorage();
      if (mergedLocal?.tripLists?.length) {
        tripLists = normalizeTripLists(mergedLocal.tripLists);
        console.log('Initializing from localStorage (server had no trip lists)');
      }
    }

    if (tripLists.length > 0) {
      console.log('Initializing with saved trip data');
      const selectedTripId = resolveSelectedTripId(
        tripLists,
        savedState.selectedTripId ?? mergedLocal?.selectedTripId ?? tripLists[0]?.id,
      );
      return {
        tripLists: tripLists.map(withRenumberedPlaces),
        selectedTripId,
        mapState: savedState.mapState ?? mergedLocal?.mapState ?? defaultMap,
        isAddPlaceModalOpen: false,
        hoveredPlace: null,
        headerImages: savedState.headerImages ?? mergedLocal?.headerImages ?? [],
      };
    }
  } catch (error) {
    console.error('Error loading initial state:', error);
  }

  console.log('Initializing with empty state');
  return {
    tripLists: [],
    selectedTripId: null,
    mapState: {
      center: [20.5937, 78.9629],
      zoom: 6,
    },
    isAddPlaceModalOpen: false,
    hoveredPlace: null,
    headerImages: [],
  };
};

const defaultMapState = {
  center: [20.5937, 78.9629] as [number, number],
  zoom: 6,
};

/** Guest / offline-first paint: sample trip. Logged-in users start empty until `getInitialState` resolves (avoids Kerala flash). */
function createInitialAppState(): AppState {
  if (authUtils.isAuthenticated()) {
    return {
      tripLists: [],
      selectedTripId: null,
      mapState: { ...defaultMapState },
      isAddPlaceModalOpen: false,
      hoveredPlace: null,
      headerImages: [],
    };
  }
  return {
    tripLists: [withRenumberedPlaces(SAMPLE_KERALA_TRIP)],
    selectedTripId: SAMPLE_KERALA_TRIP.id,
    mapState: { ...defaultMapState },
    isAddPlaceModalOpen: false,
    hoveredPlace: null,
    headerImages: [],
  };
}

function App() {
  const [user, setUser] = useState<AuthUser | null>(authUtils.getUser());
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(!authUtils.isAuthenticated());
  const [profileImageError, setProfileImageError] = useState<boolean>(false);
  
  const [appState, setAppState] = useState<AppState>(() => createInitialAppState());
  /** True on first paint while we fetch saved trips (only for authenticated sessions). */
  const [isLoadingSavedAppState, setIsLoadingSavedAppState] = useState(() => authUtils.isAuthenticated());
  const markerRefs = useRef<Record<string, L.Marker>>({});
  const hasLoadedSavedData = useRef(false);

  // Check authentication on mount and load data if authenticated
  useEffect(() => {
    if (authUtils.isAuthenticated()) {
      const savedUser = authUtils.getUser();
      if (savedUser) {
        console.log('Loaded user from storage:', savedUser);
        setUser(savedUser);
      }
      authUtils
        .fetchProfile()
        .then((fresh) => {
          if (!fresh) return;
          const base = authUtils.getUser();
          if (!base || base.id !== fresh.id) return;
          const merged = {
            ...base,
            name: fresh.name || base.name,
            email: fresh.email || base.email,
            picture:
              fresh.picture != null && String(fresh.picture).trim() !== ''
                ? String(fresh.picture).trim()
                : base.picture ?? null,
          };
          if (merged.picture !== base.picture || merged.name !== base.name) {
            authUtils.setUser(merged);
            setUser(merged);
          }
        })
        .catch(() => {
          /* offline or stale token */
        });
      const failsafeMs = 25_000;
      const failsafe = window.setTimeout(() => {
        console.warn('Trip load timed out; clearing loading overlay.');
        hasLoadedSavedData.current = true;
        setIsLoadingSavedAppState(false);
      }, failsafeMs);
      // Load user's data
      getInitialState()
        .then((initialState) => {
          setAppState(initialState);
        })
        .catch((error) => {
          console.error('Failed to load initial state:', error);
        })
        .finally(() => {
          window.clearTimeout(failsafe);
          hasLoadedSavedData.current = true;
          setIsLoadingSavedAppState(false);
        });
    } else {
      hasLoadedSavedData.current = true; // Allow saving even if not authenticated (will fail gracefully)
    }
  }, []);

  // Retry avatar load when URL or account changes
  useEffect(() => {
    if (user?.picture) {
      setProfileImageError(false);
    } else {
      setProfileImageError(true);
    }
  }, [user?.picture, user?.id]);

  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<{ place: Place; image: string } | null>(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [viewingPlaceId, setViewingPlaceId] = useState<string | null>(null); // For modal popup
  const [hoveredPlaceId, setHoveredPlaceId] = useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(320); // Sidebar width in pixels
  const [isResizing, setIsResizing] = useState(false);
  const [fitBoundsActive, setFitBoundsActive] = useState(false);
  const [showAllTrips, setShowAllTrips] = useState(false); // Default: do not auto-enable India "all trips" dots on refresh
  /** Second India-map press: map shows no markers (not the selected list). */
  const [hideAllMapMarkers, setHideAllMapMarkers] = useState(false);
  /** Mid-leg transport circles on the map (train/bus/etc.); lines stay visible when off. */
  const [showTransportLegMarkers, setShowTransportLegMarkers] = useState(false);
  const [chatbotOpen, setChatbotOpen] = useState(false);
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const [isStreetViewOpen, setIsStreetViewOpen] = useState(false);

  useEffect(() => {
    if (isStreetViewOpen) {
      setIsProfileDropdownOpen(false);
      setChatbotOpen(false);
    }
  }, [isStreetViewOpen]);

  /** Same pulse as the map "fit" control — GoogleMapWrapper reacts on false→true. */
  const pulseFitBounds = () => {
    setFitBoundsActive(false);
    setTimeout(() => setFitBoundsActive(true), 10);
  };

  // Handle sidebar resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizing) {
        const newWidth = e.clientX;
        // Constrain sidebar width between 250px and 600px
        if (newWidth >= 250 && newWidth <= 600) {
          setSidebarWidth(newWidth);
        }
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  // Marker icon updates are now handled in GoogleMapWrapper component

  // Note: Images are no longer pre-fetched and saved automatically
  // Images are fetched on-demand when viewing places in PlacePopup
  // Only manually uploaded images (base64 data URLs) are saved to the database
  // Online images (Unsplash/Wikipedia) are displayed directly without saving

  // Save data to server (only if authenticated)
  useEffect(() => {
    // Skip save if not authenticated
    if (!authUtils.isAuthenticated()) {
      return;
    }
    
    // Skip save until we've checked for saved data on initial mount
    if (!hasLoadedSavedData.current) {
      return;
    }
    
    // Debounce saves to avoid too many API calls
    const timeoutId = setTimeout(async () => {
      try {
        await storageUtils.saveAppState(appState);
      } catch (error: any) {
        console.error('Failed to save app state:', error);
        // Error is already handled in storageApi with localStorage fallback
      }
    }, 500); // Wait 500ms after last change before saving

    return () => clearTimeout(timeoutId);
  }, [appState.tripLists, appState.selectedTripId, appState.mapState]);

  const handleLogin = (loggedInUser: AuthUser) => {
    // Ensure user object is properly stored with all fields including picture
    const userData = {
      id: loggedInUser.id,
      email: loggedInUser.email,
      name: loggedInUser.name || loggedInUser.email.split('@')[0],
      picture: loggedInUser.picture || null,
    };
    console.log('handleLogin - received user from login:', loggedInUser);
    console.log('handleLogin - storing user:', userData);
    console.log('handleLogin - picture URL:', userData.picture);
    authUtils.setUser(userData);
    setUser(userData);
    setProfileImageError(false);
    setIsAuthModalOpen(false);
    // Reload data after login (avoid saving guest Kerala state while fetching)
    hasLoadedSavedData.current = false;
    setIsLoadingSavedAppState(true);
    const failsafeMs = 25_000;
    const failsafe = window.setTimeout(() => {
      console.warn('Trip load after login timed out; clearing loading overlay.');
      hasLoadedSavedData.current = true;
      setIsLoadingSavedAppState(false);
    }, failsafeMs);
    getInitialState()
      .then((initialState) => {
        setAppState(initialState);
      })
      .catch((error) => {
        console.error('Failed to load initial state after login:', error);
      })
      .finally(() => {
        window.clearTimeout(failsafe);
        hasLoadedSavedData.current = true;
        setIsLoadingSavedAppState(false);
      });
  };

  const handleLogout = () => {
    authUtils.logout();
    setUser(null);
    setProfileImageError(false);
    setIsAuthModalOpen(true);
    setIsLoadingSavedAppState(false);
    // Reset to sample data (same entry experience as a fresh load / refresh)
    setShowAllTrips(true);
    setHideAllMapMarkers(false);
    setAppState({
      tripLists: [withRenumberedPlaces(SAMPLE_KERALA_TRIP)],
      selectedTripId: SAMPLE_KERALA_TRIP.id,
      mapState: {
        center: [20.5937, 78.9629],
        zoom: 6,
      },
      isAddPlaceModalOpen: false,
      hoveredPlace: null,
      headerImages: [],
    });
  };

  const selectedTrip = appState.tripLists.find(trip => trip.id === appState.selectedTripId);

  /** Single source of truth for map hover preview (avoids stale appState.hoveredPlace when only hoveredPlaceId was cleared). */
  const mapHoverPreviewPlace = useMemo(() => {
    if (!hoveredPlaceId) return null;
    for (const trip of appState.tripLists) {
      const p = trip.places.find((x) => x.id === hoveredPlaceId);
      if (p) return p;
    }
    return null;
  }, [hoveredPlaceId, appState.tripLists]);

  const handleAddPlace = (placeData: Omit<Place, 'id' | 'createdAt' | 'assignedNumber' | 'isRevisit' | 'originalPlaceId'>) => {
    if (!selectedTrip) return;

    // Check if this place already exists (revisit check)
    // Match by name (normalized) or by coordinates (within 0.01 degrees ~1km)
    const existingPlace = selectedTrip.places.find(p => {
      const nameMatch = p.name.toLowerCase().trim() === placeData.name.toLowerCase().trim();
      const coordMatch = Math.abs(p.coords[0] - placeData.coords[0]) < 0.01 &&
                        Math.abs(p.coords[1] - placeData.coords[1]) < 0.01;
      return nameMatch || coordMatch;
    });

    let assignedNumber: number | undefined;
    let isRevisit = false;
    let originalPlaceId: string | undefined;
    let isIntermediate = placeData.isIntermediate || false;

    if (existingPlace && !placeData.isIntermediate) {
      isRevisit = true;
      originalPlaceId =
        existingPlace.isRevisit && existingPlace.originalPlaceId
          ? existingPlace.originalPlaceId
          : existingPlace.id;
      isIntermediate = true;
      const origin = selectedTrip.places.find((p) => p.id === originalPlaceId);
      assignedNumber = origin?.assignedNumber ?? existingPlace.assignedNumber;
    } else if (!placeData.isIntermediate) {
      const numberedPlaces = selectedTrip.places.filter((p) => !p.isIntermediate);
      assignedNumber = numberedPlaces.length + 1;
    }

    const newPlace: Place = {
      ...placeData,
      id: `place-${Date.now()}`,
      createdAt: new Date().toISOString(),
      assignedNumber,
      isIntermediate,
      isRevisit: isRevisit || undefined,
      originalPlaceId,
    };

    setAppState((prev) => ({
      ...prev,
      tripLists: prev.tripLists.map((trip) =>
        trip.id === selectedTrip.id
          ? { ...trip, places: renumberTripPlaces([...trip.places, newPlace]) }
          : trip,
      ),
      isAddPlaceModalOpen: false,
    }));
  };

  const handleDeletePlace = (placeId: string) => {
    if (!selectedTrip) return;

    setAppState(prev => ({
      ...prev,
      tripLists: prev.tripLists.map(trip =>
        trip.id === selectedTrip.id
          ? { ...trip, places: trip.places.filter(place => place.id !== placeId) }
          : trip
      ),
    }));
  };

  const handleUpdatePlaceDetails = (
    placeId: string,
    updates: {
      name?: string;
      description?: string;
      image?: string;
      distance?: string;
      time?: string;
      transport?: TransportMode;
    },
  ) => {
    if (!selectedTrip) return;

    setAppState(prev => ({
      ...prev,
      tripLists: prev.tripLists.map(trip =>
        trip.id === selectedTrip.id
          ? {
              ...trip,
              places: trip.places.map(place =>
                place.id === placeId
                  ? { ...place, ...updates }
                  : place
              ),
            }
          : trip
      ),
    }));
  };

  const togglePlaceNumbering = (placeId: string) => {
    if (!selectedTrip) return;

    setAppState(prev => ({
      ...prev,
      tripLists: prev.tripLists.map(trip => {
        if (trip.id !== selectedTrip.id) return trip;
        
        const placeIndex = trip.places.findIndex(p => p.id === placeId);
        if (placeIndex === -1) return trip;

        const place = trip.places[placeIndex];
        const isCurrentlyIntermediate = place.isIntermediate || false;
        
        // Toggle intermediate status
        const updatedPlace: Place = {
          ...place,
          isIntermediate: !isCurrentlyIntermediate,
        };

        // If becoming intermediate, remove assignedNumber
        if (!isCurrentlyIntermediate) {
          updatedPlace.assignedNumber = undefined;
        }

        const newPlaces = [...trip.places];
        newPlaces[placeIndex] = updatedPlace;

        return { ...trip, places: renumberTripPlaces(newPlaces) };
      }),
    }));
  };

  const movePlace = (placeId: string, direction: 'up' | 'down') => {
    const trip = selectedTrip;
    if (!trip) return;
    const idx = trip.places.findIndex(p => p.id === placeId);
    if (idx === -1) return;
    const newIndex = direction === 'up' ? idx - 1 : idx + 1;
    if (newIndex < 0 || newIndex >= trip.places.length) return;
    const newPlaces = [...trip.places];
    const [moved] = newPlaces.splice(idx, 1);
    newPlaces.splice(newIndex, 0, moved);
    setAppState((prev) => ({
      ...prev,
      tripLists: prev.tripLists.map((t) =>
        t.id === trip.id ? { ...t, places: renumberTripPlaces(newPlaces) } : t,
      ),
    }));
  };

  const reorderPlace = (placeId: string, targetIndex: number) => {
    const trip = selectedTrip;
    if (!trip) return;
    const currentIndex = trip.places.findIndex(p => p.id === placeId);
    if (currentIndex === -1) {
      console.warn('Place not found:', placeId);
      return;
    }
    
    console.log('reorderPlace called:', { placeId, targetIndex, currentIndex, currentLists: trip.places.map(p => p.name) });
    
    // targetIndex is an insertion index (0..length)
    const clampedTargetIndex = Math.max(0, Math.min(targetIndex, trip.places.length));
    const finalIndex = currentIndex < clampedTargetIndex ? clampedTargetIndex - 1 : clampedTargetIndex;

    if (finalIndex === currentIndex || finalIndex < 0 || finalIndex >= trip.places.length) {
      console.log('Final position same as current');
      return;
    }
    
    console.log('Moving from index', currentIndex, 'to finalIndex', finalIndex, '(targetIndex was', clampedTargetIndex, ')');
    
    const newPlaces = [...trip.places];
    const [moved] = newPlaces.splice(currentIndex, 1);
    newPlaces.splice(finalIndex, 0, moved);

    setAppState((prev) => ({
      ...prev,
      tripLists: prev.tripLists.map((t) =>
        t.id === trip.id ? { ...t, places: renumberTripPlaces(newPlaces) } : t,
      ),
    }));
  };

  const handleAddHeaderImage = (imageUrl: string) => {
    setAppState(prev => ({
      ...prev,
      headerImages: [...(prev.headerImages || []), imageUrl],
    }));
  };

  const handleDeleteHeaderImage = (imageIndex: number) => {
    setAppState(prev => {
      const newHeaderImages = [...(prev.headerImages || [])];
      newHeaderImages.splice(imageIndex, 1);
      return {
        ...prev,
        headerImages: newHeaderImages,
      };
    });
  };

  // Clean up problematic numbered PNG images from headerImages (27.png, 28.png, 29.png)
  useEffect(() => {
    if (appState.headerImages && appState.headerImages.length > 0) {
      const problematicPatterns = ['27.png', '28.png', '29.png'];
      const hasProblematicImages = appState.headerImages.some(img => 
        problematicPatterns.some(pattern => img.includes(pattern))
      );
      
      if (hasProblematicImages) {
        const cleanedImages = appState.headerImages.filter(img => 
          !problematicPatterns.some(pattern => img.includes(pattern))
        );
        
        if (cleanedImages.length !== appState.headerImages.length) {
          setAppState(prev => ({
            ...prev,
            headerImages: cleanedImages,
          }));
          console.log('Cleaned up problematic header images (27.png, 28.png, 29.png)');
        }
      }
    }
  }, [appState.headerImages]);

  const handleCreateTrip = (tripName: string): string => {
    const newTrip: TripList = {
      id: `trip-${Date.now()}`,
      name: tripName,
      color: TRIP_COLORS[appState.tripLists.length % TRIP_COLORS.length],
      places: [],
      createdAt: new Date().toISOString(),
    };

    setShowAllTrips(false);
    setHideAllMapMarkers(false);
    setAppState((prev) => ({
      ...prev,
      tripLists: [...prev.tripLists, newTrip],
      selectedTripId: newTrip.id,
    }));
    pulseFitBounds();

    // Skip auto background fetch for the default placeholder name (user will rename first)
    const placeholderName = 'New list';
    if (tripName.trim() !== placeholderName) {
      setTimeout(async () => {
        try {
          const imageUrl = await fetchPlaceImage(tripName);
          if (imageUrl) {
            setAppState((prev) => ({
              ...prev,
              tripLists: prev.tripLists.map((trip) =>
                trip.id === newTrip.id ? { ...trip, backgroundImage: imageUrl } : trip,
              ),
            }));
          }
        } catch (error) {
          console.log(`Failed to fetch background image for ${tripName}:`, error);
        }
      }, 100);
    }

    return newTrip.id;
  };

  const handleDeleteTrip = (tripId: string) => {
    setAppState(prev => ({
      ...prev,
      tripLists: prev.tripLists.filter(trip => trip.id !== tripId),
      selectedTripId: prev.selectedTripId === tripId ? null : prev.selectedTripId,
    }));
  };

  const handleUpdateTrip = (tripId: string, newName: string) => {
    if (!newName.trim()) return; // Don't allow empty names
    setAppState(prev => ({
      ...prev,
      tripLists: prev.tripLists.map(trip =>
        trip.id === tripId ? { ...trip, name: newName.trim() } : trip
      ),
    }));
  };

  const handleUpdateTripBackground = (tripId: string, imageUrl: string) => {
    setAppState(prev => ({
      ...prev,
      tripLists: prev.tripLists.map(trip =>
        trip.id === tripId ? { ...trip, backgroundImage: imageUrl } : trip
      ),
    }));
  };

  const reorderTrip = (tripId: string, targetIndex: number) => {
    console.log('reorderTrip called:', { tripId, targetIndex, currentLists: appState.tripLists.map(t => t.name) });
    
    const currentIndex = appState.tripLists.findIndex(t => t.id === tripId);
    if (currentIndex === -1) {
      console.warn('Trip not found:', tripId);
      return;
    }
    
    // targetIndex is an insertion index (0..length)
    const clampedTargetIndex = Math.max(0, Math.min(targetIndex, appState.tripLists.length));
    const finalIndex = currentIndex < clampedTargetIndex ? clampedTargetIndex - 1 : clampedTargetIndex;

    if (finalIndex === currentIndex || finalIndex < 0 || finalIndex >= appState.tripLists.length) {
      console.log('Final position same as current', { currentIndex, clampedTargetIndex, finalIndex });
      return;
    }
    
    console.log('Moving from index', currentIndex, 'to index', finalIndex);
    
    const newTripLists = [...appState.tripLists];
    const [moved] = newTripLists.splice(currentIndex, 1);
    newTripLists.splice(finalIndex, 0, moved);
    
    console.log('New order:', newTripLists.map(t => t.name));
    
    setAppState(prev => ({
      ...prev,
      tripLists: newTripLists,
    }));
  };

  return (
    <div className="relative flex h-screen min-h-0 overflow-hidden bg-white text-gray-900 text-[15px] md:text-base">
      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => {
          if (authUtils.isAuthenticated()) {
            setIsAuthModalOpen(false);
          }
        }}
        onLogin={handleLogin}
      />

      {/* Login/User Button - Top right corner (hidden in Street View and during app-state loading overlay) */}
      {!isStreetViewOpen && !isLoadingSavedAppState ? (
        <div className="fixed top-4 right-4 z-[9999]">
          {user ? (
            <>
              {/* Backdrop - Only show when dropdown is open */}
              <AnimatePresence>
                {isProfileDropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setIsProfileDropdownOpen(false)}
                    className="fixed inset-0 z-[9998]"
                  />
                )}
              </AnimatePresence>

              {/* Vertical Stack - Profile pic and Logout button (cylinder shape) */}
              <div className="relative flex flex-col gap-2 z-[9999]">
                  {/* Profile Button with Google One-style multi-color border */}
                  <motion.button
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
                    className="relative w-12 h-12 rounded-full shadow-lg hover:shadow-xl transition-all duration-200"
                    style={{
                      padding: '2px',
                      background: 'conic-gradient(from 0deg, #EA4335 0deg, #4285F4 90deg, #34A853 180deg, #FBBC05 270deg, #EA4335 360deg)',
                    }}
                  >
                    {/* Inner circle with profile picture */}
                    <div className="w-full h-full rounded-full overflow-hidden bg-white dark:bg-gray-800 relative">
                      {/*
                        Google avatar URLs (lh3.googleusercontent.com) often 403/block unless Referer is omitted.
                        referrerPolicy="no-referrer" fixes intermittent missing photos. Eager load — avatar is always visible.
                      */}
                      {user.picture && !profileImageError ? (
                        <img
                          key={user.picture}
                          src={user.picture}
                          alt={user.name || user.email}
                          referrerPolicy="no-referrer"
                          loading="eager"
                          decoding="async"
                          fetchPriority="high"
                          className="absolute inset-0 z-10 h-full w-full object-cover"
                          onError={() => {
                            console.error('Failed to load profile picture:', user.picture);
                            setProfileImageError(true);
                          }}
                        />
                      ) : null}
                      {/* Fallback: no URL or failed to load */}
                      <div
                        className={`absolute inset-0 z-0 flex items-center justify-center transition-opacity duration-200 ${
                          !user.picture || profileImageError ? 'opacity-100' : 'opacity-0 pointer-events-none'
                        }`}
                      >
                        <User size={24} className="text-gray-600 dark:text-gray-400" />
                      </div>
                    </div>
                  </motion.button>

                  {/* Logout Button - Circular, below profile pic (slides down) */}
                  <AnimatePresence>
                    {isProfileDropdownOpen && (
                      <motion.button
                        initial={{ scale: 0, opacity: 0, y: -10 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0, opacity: 0, y: -10 }}
                        transition={{ duration: 0.1, ease: 'easeOut' }}
                        onClick={() => {
                          setIsProfileDropdownOpen(false);
                          handleLogout();
                        }}
                        className="w-12 h-12 rounded-full bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center"
                        title="Logout"
                      >
                        <LogOut size={20} className="text-white" />
                      </motion.button>
                    )}
                  </AnimatePresence>
                </div>
            </>
          ) : (
            <motion.button
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              onClick={() => setIsAuthModalOpen(true)}
              className="flex items-center gap-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg shadow-lg px-4 py-2 transition-colors"
            >
              <LogIn size={18} />
              <span className="font-medium">Login</span>
            </motion.button>
          )}
        </div>
      ) : null}

      {/* Sidebar */}
      <div
        style={{ width: `${sidebarWidth}px` }}
        className="relative z-10 flex h-full min-h-0 shrink-0 flex-col"
      >
        <Sidebar
          tripLists={appState.tripLists}
          selectedTripId={appState.selectedTripId}
          onSelectTrip={(tripId) => {
            const nextId = tripId && tripId !== '' ? tripId : null;
            setSelectedPlaceId(null);
            setViewingPlaceId(null);
            setHoveredPlaceId(null);
            if (nextId) {
              setShowAllTrips(false);
              setHideAllMapMarkers(false);
            }
            setAppState((prev) => ({ ...prev, selectedTripId: nextId }));
            if (nextId) {
              setTimeout(() => pulseFitBounds(), 0);
            }
          }}
          onCreateTrip={handleCreateTrip}
          onDeleteTrip={handleDeleteTrip}
          onUpdateTrip={handleUpdateTrip}
          onUpdateTripBackground={handleUpdateTripBackground}
          onReorderTrip={reorderTrip}
          onAddPlace={() => {
            // Close any open place popup when opening "Add Place"
            setViewingPlaceId(null);
            setSelectedPlaceId(null);
            setAppState(prev => ({ ...prev, isAddPlaceModalOpen: true }));
          }}
          onMovePlace={movePlace}
          onReorderPlace={reorderPlace}
          selectedPlaceId={selectedPlaceId}
          onSelectPlace={setSelectedPlaceId}
          onViewPlace={(placeId) => {
            setSelectedPlaceId(placeId);
            setViewingPlaceId(placeId);
          }}
          onBackToLists={() => {
            setSelectedPlaceId(null);
            setViewingPlaceId(null);
            setHoveredPlaceId(null);
            setShowAllTrips(false);
            setHideAllMapMarkers(true);
            pulseFitBounds();
          }}
          onTogglePlaceNumbering={togglePlaceNumbering}
          onHoverPlace={setHoveredPlaceId}
          onToggleShowAllTrips={() => {
            if (showAllTrips) {
              setShowAllTrips(false);
              setHideAllMapMarkers(true);
              pulseFitBounds();
            } else if (hideAllMapMarkers) {
              setHideAllMapMarkers(false);
              setShowAllTrips(true);
            } else {
              setShowAllTrips(true);
            }
          }}
          showAllTrips={showAllTrips}
          hideAllMapMarkers={hideAllMapMarkers}
          onDeletePlace={handleDeletePlace}
          headerImages={appState.headerImages || []}
          onAddHeaderImage={handleAddHeaderImage}
          onDeleteHeaderImage={handleDeleteHeaderImage}
        />
        
        {/* Resizer Handle - Visible on hover */}
        <div
          onMouseDown={(e) => {
            e.preventDefault();
            setIsResizing(true);
          }}
          className="absolute right-0 top-0 w-1 cursor-col-resize opacity-0 hover:opacity-100 transition-opacity z-50 group"
          style={{ height: '100%' }}
          title="Drag to resize sidebar"
        >
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-0.5 h-8 bg-gray-400 group-hover:bg-gray-500 rounded-full"></div>
          </div>
        </div>
      </div>

      {/* Main Map Area */}
      <div
        className="flex-1 relative"
        style={{ minHeight: 0, minWidth: 0 }}
        onPointerLeave={(e) => {
          const next = e.relatedTarget as Node | null;
          if (next && e.currentTarget.contains(next)) return;
          setHoveredPlaceId(null);
          setAppState((prev) => ({ ...prev, hoveredPlace: null }));
        }}
      >
        <GoogleMapWrapper
          center={appState.mapState.center}
          zoom={appState.mapState.zoom}
          selectedTrip={selectedTrip || null}
          showAllTrips={showAllTrips}
          hideAllMapMarkers={hideAllMapMarkers}
          tripLists={appState.tripLists}
          selectedPlaceId={selectedPlaceId}
          hoveredPlaceId={hoveredPlaceId}
          showTransportOnMap={showTransportLegMarkers && !showAllTrips}
          fitBoundsActive={fitBoundsActive || showAllTrips}
          onMapClick={() => {
            // Clear selection when clicking on map (not on marker)
            setSelectedPlaceId(null);
            setHoveredPlaceId(null);
            setViewingPlaceId(null);
            setAppState((prev) => ({ ...prev, hoveredPlace: null }));
          }}
          onMarkerClick={(placeId) => {
            setHoveredPlaceId(null);
            setAppState((prev) => ({ ...prev, hoveredPlace: null }));
            setSelectedPlaceId(placeId);
            setViewingPlaceId(placeId);
          }}
          onMarkerHover={(placeId, _place) => {
            if (placeId === null) {
              setHoveredPlaceId(null);
              setAppState((prev) => ({ ...prev, hoveredPlace: null }));
              return;
            }
            if (selectedPlaceId !== placeId) {
              setHoveredPlaceId(placeId);
              setAppState((prev) => ({ ...prev, hoveredPlace: null }));
            }
          }}
          onFitBoundsComplete={() => {
            setFitBoundsActive(false);
          }}
          markerRefs={markerRefs}
          onLegTransportChange={(placeId, transport) => {
            handleUpdatePlaceDetails(placeId, { transport });
          }}
          onStreetViewOpenChange={setIsStreetViewOpen}
          hideViewsControl={isLoadingSavedAppState}
        />

        {/* Hover Preview — driven only by hoveredPlaceId + live trip data */}
        <AnimatePresence>
          {mapHoverPreviewPlace?.image ? (
            <motion.div
              key={mapHoverPreviewPlace.id}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="pointer-events-none absolute left-4 bottom-10 z-[1001] max-w-xs rounded-lg bg-white p-2 shadow-lg"
            >
              <img
                src={mapHoverPreviewPlace.image}
                alt={mapHoverPreviewPlace.name}
                className="image-preview h-24 w-32 rounded object-cover"
              />
              <p className="mt-1 text-sm font-medium text-gray-800">{mapHoverPreviewPlace.name}</p>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* Fit to Trip Button - Positioned to the right of zoom controls */}
        {selectedTrip && !isStreetViewOpen ? (
          <motion.button
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => pulseFitBounds()}
            className="absolute top-4 flex items-center justify-center rounded-lg bg-black/55 p-3 text-white shadow-lg transition-colors hover:bg-black/65 z-[1000]"
            style={{ left: '20px' }}
            title={
              selectedTrip.places.length > 0
                ? 'Fit map to show all places'
                : 'Show all of India'
            }
          >
            <Maximize2 size={18} className="text-white" strokeWidth={2} />
          </motion.button>
        ) : null}

      </div>

      {/* Add Place Modal */}
      <AnimatePresence>
        {appState.isAddPlaceModalOpen && selectedTrip && (
          <PlacePopup
            key="create-place"
            mode="create"
            tripColor={selectedTrip.color}
            tripName={selectedTrip.name}
            sidebarWidth={sidebarWidth}
            onClose={() => setAppState(prev => ({ ...prev, isAddPlaceModalOpen: false }))}
            onCreate={(placeData) => handleAddPlace(placeData)}
          />
        )}
      </AnimatePresence>

      {/* View/Edit Place Modal */}
      <AnimatePresence>
        {viewingPlaceId && selectedTrip && (() => {
          const viewingPlace = selectedTrip.places.find(p => p.id === viewingPlaceId);
          return viewingPlace ? (
            <PlacePopup
              key={`view-${viewingPlaceId}`}
              place={viewingPlace}
              mode="edit"
              tripColor={selectedTrip.color}
              tripName={selectedTrip.name}
              sidebarWidth={sidebarWidth}
              onClose={() => {
                setViewingPlaceId(null);
                setSelectedPlaceId(null);
              }}
              onUpdate={(updates) => {
                handleUpdatePlaceDetails(viewingPlace.id, updates);
              }}
            />
          ) : null;
        })()}
      </AnimatePresence>

      {/* Image Modal */}
      <AnimatePresence>
        {isImageModalOpen && selectedImage && (
          <ImageModal
            place={selectedImage.place}
            image={selectedImage.image}
            onClose={() => {
              setIsImageModalOpen(false);
              setSelectedImage(null);
            }}
          />
        )}
      </AnimatePresence>

      {/* Transport leg markers toggle — same column as chatbot FAB, 5px above it (or above panel when chat is open) */}
      {!isStreetViewOpen && selectedTrip && !showAllTrips && !hideAllMapMarkers && (
        <motion.button
          type="button"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowTransportLegMarkers((v) => !v)}
          className="fixed right-6 z-[9998] flex size-12 shrink-0 items-center justify-center rounded-full border-2 border-white shadow-md outline-none transition-[transform,opacity] duration-200 focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 dark:border-gray-800"
          style={{
            bottom: chatbotOpen
              ? `calc(2rem + ${TRAVEL_CHATBOT_PANEL_HEIGHT_PX}px + 5px)`
              : 'calc(2rem + 3rem + 5px)',
            backgroundColor: showTransportLegMarkers ? selectedTrip.color : 'rgb(156 163 175)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
          }}
          title={
            showTransportLegMarkers
              ? 'Hide transport icons on route (lines only)'
              : 'Show transport icons on route'
          }
          aria-pressed={showTransportLegMarkers}
          aria-label={
            showTransportLegMarkers
              ? 'Hide transport icons on route'
              : 'Show transport icons on route'
          }
        >
          <span className="text-2xl leading-none select-none" aria-hidden>
            🚂
          </span>
        </motion.button>
      )}

      {/* Travel Chatbot (hidden while loading saved app state) */}
      {!isStreetViewOpen && !isLoadingSavedAppState ? (
        <TravelChatbot
          sidebarWidth={sidebarWidth}
          isPlacePopupOpen={!!viewingPlaceId || appState.isAddPlaceModalOpen || isAuthModalOpen}
          onOpenChange={setChatbotOpen}
        />
      ) : null}

      {isLoadingSavedAppState && (
        <div
          className="absolute inset-0 z-[5000] flex items-center justify-center bg-white/85 dark:bg-gray-900/85 backdrop-blur-[2px]"
          aria-busy="true"
          aria-live="polite"
        >
          <div className="text-center">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-orange-500 border-t-transparent" />
            <p className="mt-4 text-sm font-medium text-gray-700 dark:text-gray-200">Loading your lists…</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
