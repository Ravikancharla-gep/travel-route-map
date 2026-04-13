import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Trash2, Edit2, ChevronLeft, ChevronRight, Camera, GripVertical } from 'lucide-react';
import type { TripList } from '../types';
import { compressImage } from '../utils/imageCompression';

interface SidebarProps {
  tripLists: TripList[];
  selectedTripId: string | null;
  onSelectTrip: (tripId: string | null) => void;
  onCreateTrip: (tripName: string) => string;
  onDeleteTrip: (tripId: string) => void;
  onUpdateTrip?: (tripId: string, newName: string) => void;
  onUpdateTripBackground?: (tripId: string, imageUrl: string) => void;
  onReorderTrip?: (tripId: string, targetIndex: number) => void;
  onAddPlace: () => void;
  onMovePlace?: (placeId: string, direction: 'up' | 'down') => void;
  onReorderPlace?: (placeId: string, targetIndex: number) => void;
  selectedPlaceId?: string | null;
  onSelectPlace?: (placeId: string) => void;
  onViewPlace?: (placeId: string) => void; // For opening modal popup
  onDeletePlace?: (placeId: string) => void; // For deleting a place
  onBackToLists?: () => void;
  onTogglePlaceNumbering?: (placeId: string) => void;
  onHoverPlace?: (placeId: string | null) => void;
  onToggleShowAllTrips?: () => void;
  showAllTrips?: boolean;
  hideAllMapMarkers?: boolean;
  headerImages?: string[]; // User-added favorite images
  onAddHeaderImage?: (imageUrl: string) => void; // Add image to header rotation
  onDeleteHeaderImage?: (imageIndex: number) => void; // Delete image from header rotation
}

const Sidebar: React.FC<SidebarProps> = ({
  tripLists,
  selectedTripId,
  onSelectTrip,
  onCreateTrip,
  onDeleteTrip,
  onUpdateTrip,
  onUpdateTripBackground,
  onReorderTrip,
  onAddPlace,
  onReorderPlace,
  selectedPlaceId,
  onSelectPlace,
  onViewPlace,
  onDeletePlace,
  onTogglePlaceNumbering,
  onHoverPlace,
  onToggleShowAllTrips,
  showAllTrips = false,
  hideAllMapMarkers = false,
  headerImages: _headerImages = [],
  onAddHeaderImage: _onAddHeaderImage,
  onDeleteHeaderImage: _onDeleteHeaderImage,
}) => {
  const [selectedPlaceIdLocal, setSelectedPlaceIdLocal] = useState<string | null>(null);
  const [editingTripId, setEditingTripId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [draggedTripId, setDraggedTripId] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [draggedPlaceId, setDraggedPlaceId] = useState<string | null>(null);
  const draggedPlaceIdRef = useRef<string | null>(null);
  const [dragOverPlaceIndex, setDragOverPlaceIndex] = useState<number | null>(null);
  const [currentBgImageIndex, setCurrentBgImageIndex] = useState(0);
  const [isAutoRotating, setIsAutoRotating] = useState(true);
  const rotationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [dragOverTripId, setDragOverTripId] = useState<string | null>(null); // Track which trip is being dragged over for image drop
  const [slideDirection, setSlideDirection] = useState<'left' | 'right'>('right'); // Track slide direction for transition
  const [previousImageIndex, setPreviousImageIndex] = useState<number | null>(null); // Track previous image for transition
  /** When false, only the selected trip row (and its places) is shown; use "All lists" to pick another. */
  const [sidebarShowAllLists, setSidebarShowAllLists] = useState(true);
  /** Main list scroll area — reset to top when opening a place so the bar doesn’t jump to the bottom (browser scroll anchoring / focus). */
  const sidebarScrollRef = useRef<HTMLDivElement>(null);

  const scrollSidebarListToTop = () => {
    const el = sidebarScrollRef.current;
    if (!el) return;
    el.scrollTop = 0;
    requestAnimationFrame(() => {
      el.scrollTop = 0;
    });
  };

  /** After layout (and after any focus/scroll-into-view), keep the list pane at the top — correct flex `min-h-0` must apply so this element is the one that scrolls, not `body`. */
  useLayoutEffect(() => {
    if (selectedPlaceId == null) return;
    const el = sidebarScrollRef.current;
    if (!el) return;
    el.scrollTop = 0;
    const t = window.setTimeout(() => {
      el.scrollTop = 0;
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }, 0);
    return () => window.clearTimeout(t);
  }, [selectedPlaceId]);

  // Combine hardcoded images with user-added header images
  const hardcodedImages = [
    '/Assets/header-images/1)HawaMahal.png',
    '/Assets/header-images/2)Jaisalmer.png',
    '/Assets/header-images/3)Kanyakumari.png',
    '/Assets/header-images/4)Kedarnath.png',
    '/Assets/header-images/5)Kerala.png',
    '/Assets/header-images/6)Kutch.png',
    '/Assets/header-images/7)Ladakh.png',
    '/Assets/header-images/8)Manali.png',
    '/Assets/header-images/9)Munnar.png',
    '/Assets/header-images/10)Rajasthan.png',
    '/Assets/header-images/11)RedFort.png',
    '/Assets/header-images/12)Rishikesh.png',
    '/Assets/header-images/13)ScubaDiving.png',
    '/Assets/header-images/14)Skiing.png',
    '/Assets/header-images/15)SkyDiving.png',
    '/Assets/header-images/16)Varanasi.png',
  ];
  
  // Use only hardcoded images (user-added images removed)
  const availableImages = hardcodedImages;
  
  // Auto-rotate through background images
  useEffect(() => {
    if (availableImages.length <= 1 || !isAutoRotating) {
      if (rotationIntervalRef.current) {
        clearInterval(rotationIntervalRef.current);
        rotationIntervalRef.current = null;
      }
      return;
    }
    
    rotationIntervalRef.current = setInterval(() => {
      setPreviousImageIndex(currentBgImageIndex);
      setSlideDirection('right'); // Auto-rotate slides right (forward)
      setCurrentBgImageIndex((prev) => {
        if (availableImages.length === 0) return 0;
        const newIndex = (prev + 1) % availableImages.length;
        setTimeout(() => setPreviousImageIndex(null), 500); // Clear previous after animation
        return newIndex;
      });
    }, 7000); // Rotate every 7 seconds
    
    return () => {
      if (rotationIntervalRef.current) {
        clearInterval(rotationIntervalRef.current);
        rotationIntervalRef.current = null;
      }
    };
  }, [isAutoRotating, availableImages.length]);
  
  // Get current background image (ensure circular rotation)
  const getCurrentBgImage = () => {
    if (availableImages.length === 0) {
      return ''; // Return empty string if no images
    }
    // Ensure index is always within bounds (circular)
    const validIndex = ((currentBgImageIndex % availableImages.length) + availableImages.length) % availableImages.length;
    const selectedImage = availableImages[validIndex];
    // Double-check we have a valid image
    if (selectedImage && selectedImage.trim() !== '') {
      return selectedImage;
    }
    // Fallback to first valid image
    return availableImages[0] || '';
  };
  
  // Get total number of images
  const getTotalImages = () => {
    return availableImages.length;
  };
  
  // Navigate to previous image (circular) - slides left (image comes from left)
  const goToPreviousImage = () => {
    setIsAutoRotating(false); // Pause auto-rotation when user manually navigates
    setPreviousImageIndex(currentBgImageIndex);
    setSlideDirection('left'); // Slide left for previous
    setCurrentBgImageIndex((prev) => {
      if (availableImages.length === 0) return 0;
      const newIndex = (prev - 1 + availableImages.length) % availableImages.length;
      setTimeout(() => setPreviousImageIndex(null), 500); // Clear previous after animation
      return newIndex;
    });
    // Resume auto-rotation after 15 seconds of inactivity
    setTimeout(() => {
      setIsAutoRotating(true);
    }, 15000);
  };
  
  // Navigate to next image (circular) - slides right (image comes from right)
  const goToNextImage = () => {
    setIsAutoRotating(false); // Pause auto-rotation when user manually navigates
    setPreviousImageIndex(currentBgImageIndex);
    setSlideDirection('right'); // Slide right for next
    setCurrentBgImageIndex((prev) => {
      if (availableImages.length === 0) return 0;
      const newIndex = (prev + 1) % availableImages.length;
      setTimeout(() => setPreviousImageIndex(null), 500); // Clear previous after animation
      return newIndex;
    });
    // Resume auto-rotation after 15 seconds of inactivity
    setTimeout(() => {
      setIsAutoRotating(true);
    }, 15000);
  };

  // Notion-like: single scroll area; no resizer

  const selectedTripStillPresent =
    selectedTripId != null && tripLists.some((t) => t.id === selectedTripId);
  const tripsToRender =
    sidebarShowAllLists || !selectedTripStillPresent
      ? tripLists
      : tripLists.filter((t) => t.id === selectedTripId);

  /** TRAVEL title + Add List: all-lists picker only (or single-trip app where there is no picker). */
  const showListsHeaderChrome =
    sidebarShowAllLists || tripLists.length <= 1 || !selectedTripStillPresent;

  const DEFAULT_NEW_LIST_NAME = 'New list';

  return (
    <div className="relative z-10 flex h-full min-h-0 w-full flex-col bg-white shadow-lg dark:bg-gray-800 dark:text-gray-100">
      {/* Header */}
      <div 
        className="relative p-6 border-b border-gray-200 dark:border-gray-700 overflow-hidden min-h-[180px]"
      >
        {/* Background Image - Travel India image (rotating images) */}
        <div className="absolute inset-0 overflow-hidden">
          {/* Previous image sliding out */}
          {previousImageIndex !== null && previousImageIndex !== currentBgImageIndex && availableImages[previousImageIndex] && (
            <div
              className={`absolute inset-0 ${
                slideDirection === 'right' 
                  ? 'animate-[slideOutToLeft_0.5s_ease-in-out_forwards]' 
                  : 'animate-[slideOutToRight_0.5s_ease-in-out_forwards]'
              }`}
              style={{
                backgroundImage: `url("${availableImages[previousImageIndex]}")`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                zIndex: 1,
              }}
            />
          )}
          
          {/* Current image sliding in */}
          <div
            key={`${currentBgImageIndex}-${slideDirection}`}
            className={`absolute inset-0 ${
              slideDirection === 'right' ? 'header-image-slide-right' : 'header-image-slide-left'
            }`}
            style={{
              backgroundImage: `url("${getCurrentBgImage()}")`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              zIndex: 2,
              willChange: 'transform, opacity',
            }}
          />
          {/* Light overlay for better text contrast */}
          <div className="absolute inset-0 bg-gradient-to-t from-white/30 via-transparent to-transparent"></div>
          
          {/* Navigation buttons for images */}
          {getTotalImages() > 1 && (
            <>
              <button
                onClick={goToPreviousImage}
                className="absolute left-3 bottom-4 bg-white/80 dark:bg-gray-800/80 hover:bg-white dark:hover:bg-gray-700 text-gray-800 dark:text-gray-100 rounded-full p-1.5 shadow-lg transition-all duration-200 z-20 flex items-center justify-center group"
                title="Previous image"
                aria-label="Previous image"
              >
                <ChevronLeft size={16} className="group-hover:scale-110 transition-transform" />
              </button>
              <button
                onClick={goToNextImage}
                className="absolute right-3 bottom-4 bg-white/80 dark:bg-gray-800/80 hover:bg-white dark:hover:bg-gray-700 text-gray-800 dark:text-gray-100 rounded-full p-1.5 shadow-lg transition-all duration-200 z-20 flex items-center justify-center group"
                title="Next image"
                aria-label="Next image"
              >
                <ChevronRight size={16} className="group-hover:scale-110 transition-transform" />
              </button>
            </>
          )}
        </div>
        
        {/* Content */}
        <div className="relative z-10">
          <h1 className="text-3xl font-extrabold text-gray-800 tracking-wide uppercase flex items-center gap-3 whitespace-nowrap" style={{ textShadow: '2px 2px 4px rgba(255,255,255,0.8), -1px -1px 2px rgba(255,255,255,0.8)' }}>
            <span className="hidden">TRAVEL INDIA</span>
            <div 
              className="w-12 h-12 rounded-full flex items-center justify-center shadow-lg overflow-hidden flex-shrink-0"
              style={{ 
                background: 'white',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3), 0 0 0 3px white',
                filter: 'drop-shadow(2px 2px 4px rgba(255,255,255,0.8))'
              }}
            >
              <img 
                src="/Assets/india-map-icon.png" 
                alt="India Map Icon" 
                className="w-full h-full object-contain cursor-pointer"
                style={{ transform: 'scale(1.08) translate(2px, 2px)' }}
                onClick={() => {
                  if (onToggleShowAllTrips) {
                    onToggleShowAllTrips();
                  }
                }}
                title={
                  showAllTrips
                    ? 'Hide all dots'
                    : hideAllMapMarkers
                      ? 'Show all trip dots'
                      : 'Show all trips'
                }
                onError={(e) => {
                  // Fallback to flag emoji if image not found
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  if (target.parentElement) {
                    target.parentElement.innerHTML = '<span class="text-2xl" style="font-size: 22px; line-height: 1;">🇮🇳</span>';
                  }
                }}
              />
            </div>
          </h1>
        </div>
      </div>

      <div
        ref={sidebarScrollRef}
        className="min-h-0 flex-1 overflow-y-auto p-4 [overflow-anchor:none]"
      >
        {!sidebarShowAllLists && selectedTripStillPresent && tripLists.length > 1 && (
          <button
            type="button"
            onClick={() => setSidebarShowAllLists(true)}
            className="mb-3 flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-200 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
          >
            <ChevronLeft size={18} aria-hidden />
            All lists
          </button>
        )}
        {showListsHeaderChrome && (
          <div className="mb-4">
            <div className="flex items-center justify-between gap-2">
              <motion.div
                className="flex items-center min-w-0"
                whileHover={{ scale: 1.02 }}
                transition={{ duration: 0.2 }}
              >
                <h2
                  className="text-3xl font-extrabold tracking-tight text-gray-800 dark:text-gray-100"
                  style={{ fontFamily: "'Caveat Brush', cursive" }}
                >
                  🍁 T R A V E L
                </h2>
              </motion.div>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="button"
                onClick={() => {
                  const newId = onCreateTrip(DEFAULT_NEW_LIST_NAME);
                  setEditingTripId(newId);
                  setEditingName(DEFAULT_NEW_LIST_NAME);
                  setSidebarShowAllLists(false);
                }}
                className="shrink-0 rounded-lg bg-gradient-to-r from-teal-500 to-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition-all duration-200 hover:from-teal-600 hover:to-emerald-700 hover:shadow-lg active:opacity-95"
              >
                + Add List
              </motion.button>
            </div>
            {tripLists.length === 0 && (
              <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                No lists yet. Use <span className="font-medium text-gray-700 dark:text-gray-300">Add List</span> to create your first trip.
              </p>
            )}
          </div>
        )}

        {/* Trip List Items - expand inline like Notion */}
        <div 
          className="space-y-2"
          onDragOver={(e) => {
            // Allow dropping trips in the container (but not image files)
            if (draggedTripId && !e.dataTransfer.types.includes('Files')) {
              e.preventDefault();
              e.stopPropagation();
              e.dataTransfer.dropEffect = 'move';
            }
          }}
          onDrop={(e) => {
            // Handle container-level drop only near the bottom of the list.
            // Prevent accidental "drop to end" when pointer is near the top.
            const sourceId = e.dataTransfer.getData('text/trip-id');
            if (sourceId && draggedTripId === sourceId && onReorderTrip) {
              e.preventDefault();
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              const isNearBottom = e.clientY >= rect.bottom - 24;
              if (isNearBottom) {
                onReorderTrip(sourceId, tripLists.length);
              } else if (dragOverIndex !== null) {
                onReorderTrip(sourceId, dragOverIndex);
              }
              setDraggedTripId(null);
              setDragOverIndex(null);
            }
          }}
        >
          {/* Explicit top drop zone for trips */}
          {draggedTripId && (
            <div
              className="h-2 rounded-full mx-2 bg-transparent"
              onDragOver={(e) => {
                if (draggedTripId && !e.dataTransfer.types.includes('Files')) {
                  e.preventDefault();
                  e.stopPropagation();
                  e.dataTransfer.dropEffect = 'move';
                  if (dragOverIndex !== 0) setDragOverIndex(0);
                }
              }}
              onDrop={(e) => {
                if (e.dataTransfer.types.includes('Files')) return;
                e.preventDefault();
                e.stopPropagation();
                const sourceId = e.dataTransfer.getData('text/trip-id');
                if (sourceId && draggedTripId === sourceId && onReorderTrip) {
                  onReorderTrip(sourceId, 0);
                }
                setDraggedTripId(null);
                setDragOverIndex(null);
              }}
            />
          )}
          {tripsToRender.map((trip) => {
            const tripIndex = tripLists.findIndex((t) => t.id === trip.id);
            const isActiveTrip = selectedTripId === trip.id;
            const showTripPlaces =
              !sidebarShowAllLists && selectedTripStillPresent && isActiveTrip;
            let resolvedTripBg = trip.backgroundImage;
            if (!resolvedTripBg) {
              const nl = trip.name.toLowerCase();
              if (nl.includes('kerala')) {
                resolvedTripBg = '/Assets/header-images/5)Kerala.png';
              } else if (nl.includes('gujarat') || nl.includes('kutch')) {
                resolvedTripBg = '/Assets/header-images/6)Kutch.png';
              } else if (nl.includes('varanasi')) {
                resolvedTripBg = '/Assets/header-images/16)Varanasi.png';
              }
            }
            const hasPhotoBackground = !!resolvedTripBg;
            const tripActionIconClass = hasPhotoBackground
              ? 'p-1 rounded transition-colors text-white hover:bg-white/20 dark:hover:bg-gray-700/30'
              : 'p-1 rounded transition-colors text-gray-600 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-600';
            const places = Array.isArray(trip.places) ? trip.places : [];
            // Don't show indicator above if it's at the dragged item's current position or adjacent to it
            const draggedItemIndex = draggedTripId ? tripLists.findIndex(t => t.id === draggedTripId) : -1;
            // Only show indicator if: there's a drag in progress, it's not the dragged item itself, 
            // and we're not dropping at the dragged item's original position or the position right after it (adjacent)
            const isAtDraggedPosition = dragOverIndex === draggedItemIndex;
            const isAtAdjacentPosition = dragOverIndex === draggedItemIndex + 1;
            const showDropIndicatorAbove = draggedTripId && 
                                          draggedTripId !== trip.id && 
                                          dragOverIndex === tripIndex && 
                                          !isAtDraggedPosition && 
                                          !isAtAdjacentPosition;
            return (
              <React.Fragment key={trip.id}>
                {/* Drop indicator - gap/space above the item */}
                {showDropIndicatorAbove && (
                  <div className="h-1 bg-purple-400 dark:bg-purple-500 rounded-full mx-2 my-1 animate-pulse" />
                )}
                <div 
                  onDragEnter={(e) => {
                    if (draggedTripId && draggedTripId !== trip.id && !e.dataTransfer.types.includes('Files')) {
                      e.preventDefault();
                      const rect = e.currentTarget.getBoundingClientRect();
                      const midpoint = rect.top + rect.height / 2;
                      // Add a small deadzone (5px) around midpoint to prevent flickering
                      const deadzone = 5;
                      let targetIndex: number;
                      if (e.clientY < midpoint - deadzone) {
                        targetIndex = tripIndex;
                      } else if (e.clientY > midpoint + deadzone) {
                        targetIndex = tripIndex + 1;
                      } else {
                        // In deadzone - keep current target if set, otherwise use current position
                        targetIndex = dragOverIndex !== null ? dragOverIndex : tripIndex;
                      }
                      const clampedTarget = Math.max(0, Math.min(targetIndex, tripLists.length));
                      
                      // Only update if target changed (prevents flickering)
                      if (dragOverIndex !== clampedTarget) {
                        setDragOverIndex(clampedTarget);
                      }
                    }
                  }}
                  onDragLeave={(e) => {
                    // Only clear if we're actually leaving the element boundaries
                    // Don't clear if we're entering a child element
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX;
                    const y = e.clientY;
                    // Only clear if cursor is truly outside the element
                    if (x < rect.left - 5 || x > rect.right + 5 || y < rect.top - 5 || y > rect.bottom + 5) {
                      // Check if we're moving to another draggable item
                      const related = e.relatedTarget as HTMLElement;
                      if (!related || !related.closest('[draggable="true"]')) {
                        setDragOverIndex(null);
                      }
                    }
                  }}
                  onDragOver={(e) => {
                    // Only handle trip dragging, not image files
                    if (draggedTripId && draggedTripId !== trip.id && !e.dataTransfer.types.includes('Files')) {
                      e.preventDefault();
                      e.stopPropagation();
                      e.dataTransfer.dropEffect = 'move';
                      const rect = e.currentTarget.getBoundingClientRect();
                      const midpoint = rect.top + rect.height / 2;
                      // Add a small deadzone (5px) around midpoint to prevent flickering
                      const deadzone = 5;
                      let targetIndex: number;
                      if (e.clientY < midpoint - deadzone) {
                        targetIndex = tripIndex;
                      } else if (e.clientY > midpoint + deadzone) {
                        targetIndex = tripIndex + 1;
                      } else {
                        // In deadzone - keep current target if set, otherwise use current position
                        targetIndex = dragOverIndex !== null ? dragOverIndex : tripIndex;
                      }
                      const clampedTarget = Math.max(0, Math.min(targetIndex, tripLists.length));
                      
                      // Only update if the target actually changed (prevents flickering)
                      if (dragOverIndex !== clampedTarget) {
                        setDragOverIndex(clampedTarget);
                      }
                    }
                  }}
                  onDrop={(e) => {
                    // Only handle trip reordering, not image files
                    if (e.dataTransfer.types.includes('Files')) {
                      return; // Let image drop handler handle this
                    }
                    
                    e.preventDefault();
                    e.stopPropagation();
                    const sourceId = e.dataTransfer.getData('text/trip-id');
                    if (sourceId && draggedTripId === sourceId && onReorderTrip) {
                      // Derive target from current cursor first to avoid stale dragOverIndex.
                      let targetIndex: number;
                      const rect = e.currentTarget.getBoundingClientRect();
                      const midpoint = rect.top + rect.height / 2;
                      const deadzone = 5;
                      if (e.clientY < midpoint - deadzone) {
                        targetIndex = tripIndex; // Insert before this item
                      } else if (e.clientY > midpoint + deadzone) {
                        targetIndex = tripIndex + 1; // Insert after this item
                      } else if (dragOverIndex !== null) {
                        targetIndex = dragOverIndex;
                      } else {
                        targetIndex = tripIndex;
                      }
                      targetIndex = Math.max(0, Math.min(targetIndex, tripLists.length));
                      
                      const sourceIndex = tripLists.findIndex(t => t.id === sourceId);
                      console.log('Dropping trip:', sourceId, 'from index:', sourceIndex, 'to target index:', targetIndex, '(hovered over trip at index:', tripIndex, ')');
                      onReorderTrip(sourceId, targetIndex);
                      setDraggedTripId(null);
                      setDragOverIndex(null);
                    }
                  }}
                  className="opacity-100"
                >
                {/* Trip Header */}
                <motion.div
                  whileHover={draggedPlaceId ? {} : { scale: 1.01 }}
                  onDragOver={(e) => {
                    // Handle file drag (for image drop)
                    if (e.dataTransfer.types.includes('Files')) {
                      e.preventDefault();
                      e.stopPropagation();
                      setDragOverTripId(trip.id);
                    }
                  }}
                  onDragLeave={(e) => {
                    // Only clear if leaving the trip area entirely
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX;
                    const y = e.clientY;
                    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
                      setDragOverTripId(null);
                    }
                  }}
                  onDrop={async (e) => {
                    // Only handle image file drops, don't interfere with trip reordering
                    if (e.dataTransfer.types.includes('Files')) {
                      e.preventDefault();
                      e.stopPropagation();
                      
                      // Handle image file drop
                      const files = e.dataTransfer.files;
                      if (files.length > 0 && files[0].type.startsWith('image/') && onUpdateTripBackground) {
                        const file = files[0];
                        try {
                          const compressedDataUrl = await compressImage(file, {
                            maxWidth: 1920,
                            maxHeight: 1080,
                            quality: 0.8,
                            maxSizeKB: 500,
                          });
                          onUpdateTripBackground(trip.id, compressedDataUrl);
                        } catch (error) {
                          console.error('Failed to compress image:', error);
                          // Fallback to original
                          const reader = new FileReader();
                          reader.onload = (event) => {
                            const result = event.target?.result as string;
                            if (onUpdateTripBackground) {
                              onUpdateTripBackground(trip.id, result);
                            }
                          };
                          reader.readAsDataURL(file);
                        }
                        setDragOverTripId(null);
                        return;
                      }
                      setDragOverTripId(null);
                    }
                    // For trip-id drops, let it bubble up to parent
                  }}
                  className={`p-3 rounded-lg ${sidebarShowAllLists || !selectedTripStillPresent ? 'cursor-pointer' : 'cursor-default'} ${draggedPlaceId ? '' : 'transition-all duration-200'} relative overflow-hidden border opacity-100 ${
                    hasPhotoBackground
                      ? isActiveTrip
                        ? 'border-transparent shadow-[inset_0_0_0_2px_rgba(255,255,255,0.55)] dark:shadow-[inset_0_0_0_2px_rgba(255,255,255,0.35)]'
                        : 'border-transparent hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.35)]'
                      : isActiveTrip
                        ? 'border-gray-200/80 dark:border-gray-500 bg-white dark:bg-gray-600'
                        : 'border-transparent bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600'
                  } ${
                    dragOverTripId === trip.id
                      ? 'ring-4 ring-blue-400 dark:ring-blue-500 border-blue-400 dark:border-blue-500'
                      : ''
                  }`}
                  style={
                    !hasPhotoBackground && isActiveTrip
                      ? {
                          boxShadow: `inset 3px 0 0 0 ${trip.color}, 0 1px 2px rgba(15, 23, 42, 0.07)`,
                        }
                      : undefined
                  }
                  onClick={() => {
                    if (sidebarShowAllLists || !selectedTripStillPresent) {
                      onSelectTrip(trip.id);
                      setSidebarShowAllLists(false);
                    }
                  }}
                >
                  {/* Background image + light overlay (same in view and edit modes) */}
                  {resolvedTripBg ? (
                    <>
                      <img
                        src={resolvedTripBg}
                        alt={`${trip.name} background`}
                        className="absolute inset-0 w-full h-full object-cover rounded-lg opacity-100 z-0 pointer-events-none"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src =
                            'https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?w=800&auto=format';
                          console.log('Background image not found, using fallback');
                        }}
                      />
                      <div className="absolute inset-0 bg-white/30 dark:bg-gray-800/30 z-[1] pointer-events-none rounded-lg transition-all duration-200" />
                    </>
                  ) : null}
                  <div className="relative z-10">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      {sidebarShowAllLists && tripLists.length > 1 && (
                        <span
                          role="button"
                          tabIndex={0}
                          aria-label={`Drag to reorder ${trip.name}`}
                          draggable
                          onDragStart={(e) => {
                            e.stopPropagation();
                            e.dataTransfer.setData('text/trip-id', trip.id);
                            e.dataTransfer.effectAllowed = 'move';
                            setDraggedTripId(trip.id);
                          }}
                          onDragEnd={(e) => {
                            e.stopPropagation();
                            setDraggedTripId(null);
                            setDragOverIndex(null);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className={`flex-shrink-0 cursor-grab rounded p-0.5 active:cursor-grabbing touch-none outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
                            hasPhotoBackground
                              ? 'text-white/90 hover:bg-white/15'
                              : 'text-gray-400 hover:bg-gray-200 dark:text-gray-500 dark:hover:bg-gray-600'
                          }`}
                        >
                          <GripVertical size={18} aria-hidden />
                        </span>
                      )}
                      <div
                        className="w-4 h-4 rounded-full flex-shrink-0"
                        style={{ backgroundColor: trip.color }}
                      />
                      <div className="flex-1 min-w-0">
                        {editingTripId === trip.id ? (
                          <input
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onBlur={() => {
                              if (onUpdateTrip && editingName.trim()) {
                                onUpdateTrip(trip.id, editingName.trim());
                              }
                              setEditingTripId(null);
                              setEditingName('');
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                if (onUpdateTrip && editingName.trim()) {
                                  onUpdateTrip(trip.id, editingName.trim());
                                }
                                setEditingTripId(null);
                                setEditingName('');
                              } else if (e.key === 'Escape') {
                                setEditingTripId(null);
                                setEditingName('');
                              }
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className={
                              hasPhotoBackground
                                ? 'w-full min-w-0 bg-transparent text-xl font-bold text-white placeholder-white/55 border-0 focus:outline-none focus:ring-0 rounded-none px-0 py-0.5 [text-shadow:0_1px_4px_rgba(0,0,0,0.75)]'
                                : 'w-full min-w-0 bg-transparent text-xl font-bold text-gray-800 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 border-0 focus:outline-none focus:ring-0 rounded-none px-0 py-0.5'
                            }
                            title="Edit trip name"
                            aria-label="Edit trip name"
                            placeholder="List name"
                            autoFocus
                          />
                        ) : (
                          <h3
                            className={
                              hasPhotoBackground
                                ? 'text-xl font-bold text-white whitespace-nowrap [text-shadow:0_1px_4px_rgba(0,0,0,0.75)]'
                                : 'text-xl font-bold text-gray-800 dark:text-gray-100 whitespace-nowrap'
                            }
                          >
                            {trip.name}
                          </h3>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {editingTripId !== trip.id && (
                        <>
                          {/* Background Image Upload Button */}
                          {onUpdateTripBackground && (
                            <label
                              className={`${tripActionIconClass} cursor-pointer ${
                                dragOverTripId === trip.id
                                  ? 'bg-blue-500/80 dark:bg-blue-600/80 ring-2 ring-blue-300 dark:ring-blue-400 scale-110'
                                  : ''
                              }`}
                              title={`Change background image for ${trip.name}`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Camera size={16} />
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                title={`Upload background image for ${trip.name}`}
                                aria-label={`Upload background image for ${trip.name}`}
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (file && onUpdateTripBackground) {
                                    try {
                                      const compressedDataUrl = await compressImage(file, {
                                        maxWidth: 1920,
                                        maxHeight: 1080,
                                        quality: 0.8,
                                        maxSizeKB: 500,
                                      });
                                      onUpdateTripBackground(trip.id, compressedDataUrl);
                                    } catch (error) {
                                      console.error('Failed to compress image:', error);
                                      // Fallback to original
                                      const reader = new FileReader();
                                      reader.onload = (event) => {
                                        const result = event.target?.result as string;
                                        if (onUpdateTripBackground) {
                                          onUpdateTripBackground(trip.id, result);
                                        }
                                      };
                                      reader.readAsDataURL(file);
                                    }
                                  }
                                  // Reset input
                                  e.target.value = '';
                                }}
                              />
                            </label>
                          )}
                          {/* Edit Button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingTripId(trip.id);
                              setEditingName(trip.name);
                            }}
                            className={tripActionIconClass}
                            title={`Edit ${trip.name}`}
                            aria-label={`Edit ${trip.name}`}
                          >
                            <Edit2 size={16} />
                          </button>
                        </>
                      )}
                      {/* Delete Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`Are you sure you want to delete "${trip.name}"? This action cannot be undone.`)) {
                            onDeleteTrip(trip.id);
                          }
                        }}
                        className={tripActionIconClass}
                        title={`Delete ${trip.name}`}
                        aria-label={`Delete ${trip.name}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  </div>
                </motion.div>
                </div>

                {/* Places for the focused trip only (hidden in "All lists" picker mode) */}
                {showTripPlaces && (
                  <motion.div
                    // Animation commented out - can be re-enabled if needed later
                    // initial={{ opacity: 0, height: 0 }}
                    // animate={{ opacity: 1, height: 'auto' }}
                    // exit={{ opacity: 0, height: 0 }}
                    className="ml-6 mt-2 mb-4 pl-4 border-l-2 border-gray-300 dark:border-gray-600"
                  >
                    <div className="flex items-center justify-between mb-3 gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: trip.color }}
                        />
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {places.filter(p => !p.isIntermediate).length} place{places.filter(p => !p.isIntermediate).length !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddPlace();
                        }}
                        style={{
                          background: 'linear-gradient(to right, #3b82f6, #06b6d4)',
                        }}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg text-white hover:opacity-90 shadow-md hover:shadow-lg transition-all duration-200 whitespace-nowrap flex-shrink-0"
                      >
                        + Add Place
                      </button>
                    </div>
                    
                    <div
                      className="space-y-2"
                      onDragOver={(e) => {
                        if (!draggedPlaceIdRef.current || e.dataTransfer.types.includes('Files')) {
                          return;
                        }
                        const target = e.target as HTMLElement;
                        if (target.closest('[draggable="true"]')) {
                          return;
                        }
                        e.preventDefault();
                        e.stopPropagation();
                        e.dataTransfer.dropEffect = 'move';
                        const rect = e.currentTarget.getBoundingClientRect();
                        const isNearBottom = e.clientY > rect.bottom - 20;
                        if (isNearBottom) {
                          setDragOverPlaceIndex(places.length);
                        }
                      }}
                      onDrop={(e) => {
                        const target = e.target as HTMLElement;
                        if (target.closest('[draggable="true"]')) {
                          return;
                        }
                        const sourceId = e.dataTransfer.getData('text/place-id');
                        if (
                          sourceId &&
                          draggedPlaceIdRef.current === sourceId &&
                          onReorderPlace &&
                          !e.dataTransfer.types.includes('Files')
                        ) {
                          e.preventDefault();
                          e.stopPropagation();
                          const rect = e.currentTarget.getBoundingClientRect();
                          const isNearBottom = e.clientY >= rect.bottom - 24;
                          if (isNearBottom) {
                            onReorderPlace(sourceId, places.length);
                          } else if (dragOverPlaceIndex !== null) {
                            onReorderPlace(sourceId, dragOverPlaceIndex);
                          }
                          draggedPlaceIdRef.current = null;
                          setDraggedPlaceId(null);
                          setDragOverPlaceIndex(null);
                        }
                      }}
                    >
                      {/* Explicit top drop zone for places (same pattern as trip list) */}
                      {draggedPlaceId && (
                        <div
                          className="h-2 rounded-full mx-4 bg-transparent"
                          onDragOver={(e) => {
                            if (!draggedPlaceIdRef.current || e.dataTransfer.types.includes('Files')) {
                              return;
                            }
                            e.preventDefault();
                            e.stopPropagation();
                            e.dataTransfer.dropEffect = 'move';
                            if (dragOverPlaceIndex !== 0) setDragOverPlaceIndex(0);
                          }}
                          onDrop={(e) => {
                            if (e.dataTransfer.types.includes('Files')) return;
                            e.preventDefault();
                            e.stopPropagation();
                            const sourceId = e.dataTransfer.getData('text/place-id');
                            if (sourceId && draggedPlaceIdRef.current === sourceId && onReorderPlace) {
                              onReorderPlace(sourceId, 0);
                            }
                            draggedPlaceIdRef.current = null;
                            setDraggedPlaceId(null);
                            setDragOverPlaceIndex(null);
                          }}
                        />
                      )}
                      {places.map((place, index) => {
                        // Show preserved number for revisits (isIntermediate + assignedNumber); dot only when no number
                        const displayNumber = place.assignedNumber;
                        const isPlaceSelected =
                          (selectedPlaceId ?? selectedPlaceIdLocal) === place.id;
                        // Don't show indicator above if it's at the dragged item's current position or adjacent to it
                        const draggedPlaceItemIndex = draggedPlaceId ? places.findIndex(p => p.id === draggedPlaceId) : -1;
                        const isAtDraggedPosition = dragOverPlaceIndex === draggedPlaceItemIndex;
                        const isAtAdjacentPosition = dragOverPlaceIndex === draggedPlaceItemIndex + 1;
                        const showDropIndicatorAbove = draggedPlaceId && 
                                                      draggedPlaceId !== place.id && 
                                                      dragOverPlaceIndex === index && 
                                                      !isAtDraggedPosition && 
                                                      !isAtAdjacentPosition;
                        
                        return (
                        <React.Fragment key={place.id}>
                          {/* Drop indicator - gap/space above the place item */}
                          {showDropIndicatorAbove && (
                            <div className="h-0.5 bg-purple-400 dark:bg-purple-500 rounded-full mx-4 my-1 animate-pulse" />
                          )}
                          <div
                            className={`flex items-center justify-between gap-2 text-sm opacity-100 rounded-md px-1.5 py-1 -mx-1 transition-colors ${
                              isPlaceSelected
                                ? 'bg-gray-100 dark:bg-gray-700/90'
                                : 'hover:bg-gray-50 dark:hover:bg-gray-700/45'
                            }`}
                            style={{
                              cursor: 'pointer',
                              boxShadow: isPlaceSelected
                                ? `inset 2px 0 0 0 ${trip.color}`
                                : undefined,
                            }}
                            onDragEnter={(e) => {
                              const dragId = draggedPlaceIdRef.current;
                              if (dragId && dragId !== place.id && !e.dataTransfer.types.includes('Files')) {
                                e.preventDefault();
                                const rect = e.currentTarget.getBoundingClientRect();
                                const midpoint = rect.top + rect.height / 2;
                                const deadzone = 5;
                                let targetIndex: number;
                                if (e.clientY < midpoint - deadzone) {
                                  targetIndex = index;
                                } else if (e.clientY > midpoint + deadzone) {
                                  targetIndex = index + 1;
                                } else {
                                  targetIndex =
                                    dragOverPlaceIndex !== null ? dragOverPlaceIndex : index;
                                }
                                const clampedTarget = Math.max(0, Math.min(targetIndex, places.length));
                                if (dragOverPlaceIndex !== clampedTarget) {
                                  setDragOverPlaceIndex(clampedTarget);
                                }
                              }
                            }}
                            onDragOver={(e) => {
                              const dragId = draggedPlaceIdRef.current;
                              if (
                                !dragId ||
                                dragId === place.id ||
                                e.dataTransfer.types.includes('Files')
                              ) {
                                return;
                              }
                              e.preventDefault();
                              e.stopPropagation();
                              e.dataTransfer.dropEffect = 'move';
                              const rect = e.currentTarget.getBoundingClientRect();
                              const midpoint = rect.top + rect.height / 2;
                              const deadzone = 5;
                              let targetIndex: number;
                              if (e.clientY < midpoint - deadzone) {
                                targetIndex = index;
                              } else if (e.clientY > midpoint + deadzone) {
                                targetIndex = index + 1;
                              } else {
                                targetIndex =
                                  dragOverPlaceIndex !== null ? dragOverPlaceIndex : index;
                              }
                              const clampedTarget = Math.max(0, Math.min(targetIndex, places.length));
                              if (dragOverPlaceIndex !== clampedTarget) {
                                setDragOverPlaceIndex(clampedTarget);
                              }
                            }}
                            onDragLeave={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              const x = e.clientX;
                              const y = e.clientY;
                              if (x < rect.left - 5 || x > rect.right + 5 || y < rect.top - 5 || y > rect.bottom + 5) {
                                const related = e.relatedTarget as HTMLElement;
                                if (!related || !related.closest('[draggable="true"]')) {
                                  setDragOverPlaceIndex(null);
                                }
                              }
                            }}
                            onDrop={(e) => {
                              if (e.dataTransfer.types.includes('Files')) {
                                return;
                              }

                              e.preventDefault();
                              e.stopPropagation();

                              const sourceId = e.dataTransfer.getData('text/place-id');
                              if (
                                sourceId &&
                                draggedPlaceIdRef.current === sourceId &&
                                onReorderPlace
                              ) {
                                const rect = e.currentTarget.getBoundingClientRect();
                                const midpoint = rect.top + rect.height / 2;
                                const deadzone = 5;
                                let targetIndex: number;
                                if (e.clientY < midpoint - deadzone) {
                                  targetIndex = index;
                                } else if (e.clientY > midpoint + deadzone) {
                                  targetIndex = index + 1;
                                } else if (dragOverPlaceIndex !== null) {
                                  targetIndex = dragOverPlaceIndex;
                                } else {
                                  targetIndex = index;
                                }
                                targetIndex = Math.max(0, Math.min(targetIndex, places.length));

                                const sourceIndex = places.findIndex((p) => p.id === sourceId);
                                console.log(
                                  'Dropping place:',
                                  sourceId,
                                  'from index:',
                                  sourceIndex,
                                  'to target index:',
                                  targetIndex,
                                  '(hovered over place at index:',
                                  index,
                                  ')',
                                );
                                onReorderPlace(sourceId, targetIndex);
                                draggedPlaceIdRef.current = null;
                                setDraggedPlaceId(null);
                                setDragOverPlaceIndex(null);
                              }
                            }}
                            onMouseEnter={() => {
                              if (onHoverPlace) {
                                onHoverPlace(place.id);
                              }
                            }}
                            onMouseLeave={() => {
                              if (onHoverPlace) {
                                onHoverPlace(null);
                              }
                            }}
                            onClick={(e) => {
                              // Don't trigger click if we just finished dragging
                              if (draggedPlaceId === place.id) {
                                return;
                              }
                              e.stopPropagation();
                              if (onSelectPlace) onSelectPlace(place.id);
                              else setSelectedPlaceIdLocal(place.id);
                              if (onViewPlace) {
                                onViewPlace(place.id);
                                scrollSidebarListToTop();
                              }
                            }}
                          >
                          <div 
                            className="flex items-center gap-2 select-none min-w-0 flex-1"
                            style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
                          >
                            {places.length > 1 && (
                              <span
                                role="button"
                                tabIndex={0}
                                aria-label={`Drag to reorder ${place.name}`}
                                draggable
                                onDragStart={(e) => {
                                  e.stopPropagation();
                                  e.dataTransfer.setData('text/place-id', place.id);
                                  e.dataTransfer.effectAllowed = 'move';
                                  draggedPlaceIdRef.current = place.id;
                                  setDraggedPlaceId(place.id);
                                }}
                                onDragEnd={(e) => {
                                  e.stopPropagation();
                                  draggedPlaceIdRef.current = null;
                                  setDraggedPlaceId(null);
                                  setDragOverPlaceIndex(null);
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className="flex-shrink-0 cursor-grab rounded p-0.5 text-gray-400 hover:bg-gray-200 active:cursor-grabbing dark:text-gray-500 dark:hover:bg-gray-600 outline-none focus-visible:ring-2 focus-visible:ring-teal-500 touch-none"
                              >
                                <GripVertical size={16} aria-hidden />
                              </span>
                            )}
                            {/* Number badge or dot for intermediate - clickable to toggle */}
                            {displayNumber !== undefined ? (
                              <span
                                onMouseDown={(e) => {
                                  // Prevent drag from starting when clicking the number badge
                                  e.stopPropagation();
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  if (onTogglePlaceNumbering) {
                                    onTogglePlaceNumbering(place.id);
                                  }
                                }}
                                className="w-6 h-6 bg-white dark:bg-gray-700 rounded-full flex items-center justify-center text-xs font-medium text-gray-600 dark:text-gray-200 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors flex-shrink-0"
                                title="Click to remove number"
                                style={{ userSelect: 'none' }}
                              >
                                {displayNumber}
                              </span>
                            ) : (
                              <span
                                onMouseDown={(e) => {
                                  // Prevent drag from starting when clicking the dot
                                  e.stopPropagation();
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  if (onTogglePlaceNumbering) {
                                    onTogglePlaceNumbering(place.id);
                                  }
                                }}
                                className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                                title="Click to add number"
                                style={{ userSelect: 'none' }}
                              >
                                <span className="w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-500" />
                              </span>
                            )}
                            <span 
                              className={`${
                                isPlaceSelected
                                  ? 'text-gray-900 dark:text-gray-50 font-medium'
                                  : 'text-gray-700 dark:text-gray-200 font-normal'
                              } whitespace-nowrap pointer-events-none flex-1 min-w-0`}
                              style={{ userSelect: 'none' }}
                            >
                              {place.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (window.confirm(`Are you sure you want to delete "${place.name}"?`)) {
                                  if (onDeletePlace) {
                                    onDeletePlace(place.id);
                                  }
                                }
                              }}
                              className="p-1 rounded text-gray-500 hover:text-red-600 hover:bg-red-50 dark:text-gray-300 dark:hover:text-white dark:hover:bg-white/15 transition-colors"
                              title={`Delete ${place.name}`}
                              aria-label={`Delete ${place.name}`}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                        </React.Fragment>
                        );
                      })}
                      {/* Drop indicator at the end if dragging to last position */}
                      {draggedPlaceId && dragOverPlaceIndex !== null && dragOverPlaceIndex === places.length && (
                        <div className="h-0.5 bg-purple-400 dark:bg-purple-500 rounded-full mx-4 my-1 animate-pulse" />
                      )}
                    </div>
                  </motion.div>
                )}
              </React.Fragment>
            );
          })}
          {/* Drop indicator at the end if dragging to last position */}
          {draggedTripId && dragOverIndex === tripLists.length && (
            <div className="h-1 bg-purple-400 dark:bg-purple-500 rounded-full mx-2 my-1 animate-pulse" />
          )}
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
