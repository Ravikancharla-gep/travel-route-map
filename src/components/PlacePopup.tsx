import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Trash2, Save, Camera, X } from 'lucide-react';
import type { Place, TransportMode } from '../types';

const TRANSPORT_MODES: TransportMode[] = [
  'Bus',
  'Train',
  'Car',
  'Flight',
  'Bike',
  'Walk',
  'Boat',
  'Other',
];
import { compressImage } from '../utils/imageCompression';
import { fetchPlaceImage } from '../utils/placeImageFetcher';

interface PlacePopupProps {
  place?: Place; // Optional for create mode
  tripColor?: string; // For create mode styling
  tripName?: string; // Trip/list name for location filtering
  mode?: 'create' | 'edit'; // Explicit mode, or auto-detect from place
  sidebarWidth?: number; // Sidebar width for positioning
  onClose?: () => void; // For create mode modal
  onDelete?: () => void;
  onUpdate?: (updates: {
    name?: string;
    description?: string;
    image?: string;
    transport?: TransportMode;
  }) => void;
  /** When true, show transport picker (map leg icon). Only meaningful after the first stop. */
  transportEditable?: boolean;
  onCreate?: (placeData: { name: string; coords: [number, number]; description?: string; image?: string; isIntermediate?: boolean }) => void;
}

const PlacePopup: React.FC<PlacePopupProps> = ({
  place,
  tripColor = '#8B5CF6',
  tripName: _tripName = '',
  mode,
  sidebarWidth = 320,
  onClose,
  onDelete,
  onUpdate,
  onCreate,
  transportEditable = false,
}) => {
  // Auto-detect mode if not explicitly provided
  const isCreateMode = mode === 'create' || !place;
  
  // For create mode
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Array<{ display_name: string; lat: string; lon: string }>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState<number>(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const popupScrollRef = useRef<HTMLDivElement>(null);
  const hasSelectedPlace = useRef(false); // Track if user has selected a place
  const [formData, setFormData] = useState({
    name: '',
    coords: [0, 0] as [number, number],
    description: '',
    image: '',
    isIntermediate: false,
  });

  // For edit mode
  const [isEditingImage, setIsEditingImage] = useState(false); // Image overlay / drag-drop; name & description stay inline in the card
  const [editedName, setEditedName] = useState(place?.name || '');
  const [editedDescription, setEditedDescription] = useState(place?.description || '');
  const [editedImage, setEditedImage] = useState(place?.image || ''); // Only stores manually uploaded base64 images
  const [editedTransport, setEditedTransport] = useState<TransportMode>(
    (place?.transport as TransportMode) || 'Car',
  );
  const [isDragOver, setIsDragOver] = useState(false);
  const [fetchedImageUrl, setFetchedImageUrl] = useState<string | null>(null); // For online fetched images (not saved)

  // Sync local fields when switching to another place
  useEffect(() => {
    if (!place) return;
    setEditedName(place.name);
    setEditedDescription(place.description || '');
    setEditedImage(place.image || '');
    setEditedTransport((place.transport as TransportMode) || 'Car');
    setFetchedImageUrl(null);
    setIsEditingImage(false);
  }, [place?.id]);

  useLayoutEffect(() => {
    const el = popupScrollRef.current;
    if (!el) return;
    el.scrollTop = 0;
    requestAnimationFrame(() => {
      el.scrollTop = 0;
    });
  }, [place?.id, isCreateMode]);

  // Auto-fetch image when viewing a place (not in image-edit mode)
  useEffect(() => {
    // Only fetch if:
    // 1. Not in create mode
    // 2. Place exists
    // 3. No manually uploaded image (base64 data URL starts with 'data:')
    // 4. Not adjusting image (overlay off)
    if (!isCreateMode && place && !place.image && !isEditingImage && place.coords && place.coords[0] !== 0 && place.coords[1] !== 0) {
      setIsFetchingImage(true);
      fetchPlaceImage(place.name, place.coords)
        .then((imageUrl) => {
          if (imageUrl) {
            setFetchedImageUrl(imageUrl); // Store fetched URL (not in database)
          }
        })
        .catch((error) => {
          console.log('Failed to fetch place image:', error);
        })
        .finally(() => {
          setIsFetchingImage(false);
        });
    } else if (place?.image) {
      // If there's a manually uploaded image, clear fetched image
      setFetchedImageUrl(null);
    }
  }, [isCreateMode, place, isEditingImage]);

  // Place search for create mode - simple version (India only)
  useEffect(() => {
    if (!isCreateMode) return;
    const q = searchQuery.trim();
    
    // Don't trigger new search if place was just selected
    if (hasSelectedPlace.current && formData.coords[0] !== 0 && formData.coords[1] !== 0) {
      if (q.length === 0) {
        return;
      }
      const selectedNameLower = formData.name.toLowerCase().trim();
      const queryLower = q.toLowerCase().trim();
      if (queryLower === selectedNameLower || selectedNameLower.startsWith(queryLower)) {
        return;
      }
      hasSelectedPlace.current = false;
    }
    
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        setIsSearching(true);
        // Simple search - just search in India, no complex filtering
        const url = new URL('https://nominatim.openstreetmap.org/search');
        url.searchParams.set('format', 'json');
        url.searchParams.set('q', `${q}, India`);
        url.searchParams.set('countrycodes', 'in'); // Only India
        url.searchParams.set('limit', '10');
        url.searchParams.set('addressdetails', '1');
        
        const res = await fetch(url.toString(), {
          headers: { 
            'Accept': 'application/json',
            'User-Agent': 'Travel-India-App/1.0'
          },
          signal: ctrl.signal,
        });
        
        if (!res.ok) throw new Error('Search failed');
        const data = (await res.json()) as Array<{ 
          display_name: string; 
          lat: string; 
          lon: string;
          importance?: number;
        }>;
        
        // Simple: Sort by importance and take top 10 results
        const sortedData = data.sort((a, b) => (b.importance || 0) - (a.importance || 0));
        
        setSuggestions(sortedData.slice(0, 10).map(item => ({
          display_name: item.display_name,
          lat: item.lat,
          lon: item.lon,
        })));
      } catch (error) {
        console.error('Search error:', error);
        setSuggestions([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [searchQuery, isCreateMode]);

  // Auto-focus search input when form opens (create mode only)
  useEffect(() => {
    if (isCreateMode) {
      // Small delay to ensure the modal is fully rendered
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isCreateMode]);

  const [isFetchingImage, setIsFetchingImage] = useState(false);

  // Auto-fetch image when place coordinates are set (create mode only)
  useEffect(() => {
    // Only fetch if:
    // 1. In create mode
    // 2. Place name exists
    // 3. Coordinates are valid (both lat and lon must be non-zero)
    // 4. No image has been set yet (either manually or from previous fetch)
    const hasValidCoords = formData.coords[0] !== 0 && formData.coords[1] !== 0;
    const hasName = formData.name.trim().length > 0;
    const needsImage = !formData.image;
    
    if (isCreateMode && hasName && hasValidCoords && needsImage) {
      console.log('🖼️ Auto-fetching image for:', formData.name, 'at coords:', formData.coords);
      setIsFetchingImage(true);
      fetchPlaceImage(formData.name.trim(), formData.coords)
        .then((imageUrl) => {
          if (imageUrl) {
            console.log('✅ Image fetched successfully for', formData.name);
            setFormData(prev => ({ ...prev, image: imageUrl }));
          } else {
            console.log('⚠️ No image found for', formData.name);
          }
        })
        .catch((error) => {
          console.error('❌ Failed to fetch place image for', formData.name, ':', error);
        })
        .finally(() => {
          setIsFetchingImage(false);
        });
    } else if (isCreateMode && hasName && hasValidCoords && formData.image) {
      console.log('ℹ️ Image already exists for', formData.name, '- skipping fetch');
    } else if (isCreateMode && hasName && !hasValidCoords) {
      console.log('⚠️ Waiting for valid coordinates for', formData.name, '- current coords:', formData.coords);
    }
  }, [formData.name, formData.coords, formData.image, isCreateMode]);

  const handleSave = () => {
    if (isCreateMode) {
      // Validate that place is selected (has coords and name)
      if (!formData.name.trim() || formData.coords[0] === 0 || formData.coords[1] === 0) {
        // If place is not selected, focus on search input
        searchInputRef.current?.focus();
        return;
      }
      
      if (onCreate) {
        // Only save base64 images (manually uploaded) to database
        // Online fetched URLs (from Unsplash/Wikipedia) are NOT saved
        const imageToSave = formData.image?.startsWith('data:') ? formData.image : undefined;
        onCreate({
          name: formData.name.trim(),
          coords: formData.coords,
          description: formData.description || undefined,
          image: imageToSave,
          isIntermediate: formData.isIntermediate,
        });
        
        // Reset form and flag after successful creation
        hasSelectedPlace.current = false;
        setFormData({
          name: '',
          coords: [0, 0],
          description: '',
          image: '',
          isIntermediate: false,
        });
        setSearchQuery('');
        
        if (onClose) onClose();
      }
    } else {
      if (onUpdate) {
        // Only save manually uploaded images (base64) to database
        // fetchedImageUrl is NOT saved - it's fetched on-demand
        onUpdate({
          name: editedName.trim(),
          description: editedDescription.trim() || undefined,
          image: editedImage || undefined, // Only base64 (manually uploaded) images are saved
          ...(transportEditable ? { transport: editedTransport } : {}),
        });
      }
      setIsEditingImage(false);
    }
  };

  // Process image file (used by file input, drag-drop, and paste)
  // This converts to base64 and saves it (only manual uploads are saved)
  const processImageFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      return; // Not an image file
    }
    
    try {
      // Compress image before storing as base64
      const compressedDataUrl = await compressImage(file, {
        maxWidth: 1920,
        maxHeight: 1080,
        quality: 0.8,
        maxSizeKB: 500, // Maximum 500KB per image
      });
      
      // Only save manually uploaded images (base64) - these will be saved to database
      if (isCreateMode) {
        setFormData(prev => ({ ...prev, image: compressedDataUrl }));
      } else {
        setEditedImage(compressedDataUrl); // This is base64, will be saved
        setFetchedImageUrl(null); // Clear fetched URL when user uploads their own image
      }
    } catch (error) {
      console.error('Failed to compress image:', error);
      // Fallback to original if compression fails
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        if (isCreateMode) {
          setFormData(prev => ({ ...prev, image: result }));
        } else {
          setEditedImage(result); // Save base64
          setFetchedImageUrl(null); // Clear fetched URL
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      processImageFile(file);
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (allowImageEdit) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (!allowImageEdit) return;
    
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processImageFile(file);
    }
  };

  // Determine which image to display:
  // Priority: 1) Manually uploaded (base64), 2) Fetched online URL, 3) Form data (create mode)
  const currentImage = isCreateMode 
    ? formData.image 
    : (editedImage || fetchedImageUrl || ''); // editedImage is base64, fetchedImageUrl is online URL
  const currentName = isCreateMode ? formData.name : editedName;
  const allowImageEdit = isCreateMode || isEditingImage;
  /** Existing place with updates: dark bottom panel + inline fields (no mode switch). */
  const useDarkPlacePanel = !isCreateMode && !!onUpdate;

  // Paste handler
  useEffect(() => {
    if (!allowImageEdit) return;
    
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            processImageFile(file);
            break;
          }
        }
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => {
      document.removeEventListener('paste', handlePaste);
    };
  }, [allowImageEdit, isCreateMode]);

  // Popup content (reusable for both modes)
  const popupContent = (
    <div
      ref={popupScrollRef}
      className="flex w-[300px] min-h-0 flex-col overflow-y-auto rounded-2xl text-gray-900 [overflow-anchor:none] dark:text-gray-100"
      style={{ maxHeight: '488px', minHeight: '290px' }}
    >
      {/* Top Half - Image */}
      <div 
        className={`relative h-40 bg-gray-200 dark:bg-gray-700 overflow-hidden rounded-t-2xl flex-shrink-0 transition-all ${
          isDragOver && allowImageEdit ? 'ring-4 ring-purple-400 ring-offset-2' : ''
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {currentImage ? (
          <img
            src={currentImage}
            alt={currentName || 'Place'}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {isFetchingImage ? (
              <div className="flex flex-col items-center gap-2">
                <div className="w-8 h-8 border-4 border-purple-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-gray-500 dark:text-gray-400">Fetching image...</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <Camera size={32} className="text-gray-400" />
                <span className="text-xs text-gray-500 dark:text-gray-400">No image</span>
                {/* Fetch Image button - show for both create and edit modes */}
                {(isCreateMode ? (formData.coords[0] !== 0 && formData.coords[1] !== 0) : (place && place.coords && place.coords[0] !== 0 && place.coords[1] !== 0)) && (
                  <button
                    onClick={() => {
                      if (isCreateMode) {
                        if (formData.name.trim() && formData.coords[0] !== 0 && formData.coords[1] !== 0) {
                          setIsFetchingImage(true);
                          fetchPlaceImage(formData.name.trim(), formData.coords)
                            .then((imageUrl) => {
                              if (imageUrl) {
                                // Don't save fetched image to formData - just display it
                                // Only save if user manually uploads (which becomes base64)
                                setFormData(prev => ({ ...prev, image: imageUrl }));
                              }
                            })
                            .catch((error) => {
                              console.log('Failed to fetch place image:', error);
                            })
                            .finally(() => {
                              setIsFetchingImage(false);
                            });
                        }
                      } else if (place && place.coords && place.coords[0] !== 0 && place.coords[1] !== 0) {
                        setIsFetchingImage(true);
                        fetchPlaceImage(place.name, place.coords)
                          .then((imageUrl) => {
                            if (imageUrl) {
                              // Set fetched URL (not saved to database)
                              setFetchedImageUrl(imageUrl);
                            }
                          })
                          .catch((error) => {
                            console.log('Failed to fetch place image:', error);
                          })
                          .finally(() => {
                            setIsFetchingImage(false);
                          });
                      }
                    }}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg shadow-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Fetch image from Unsplash/Wikipedia"
                    disabled={isFetchingImage}
                  >
                    {isFetchingImage ? 'Fetching...' : 'Fetch Image'}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        
        {/* Drag Over Indicator */}
        {isDragOver && allowImageEdit && (
          <div className="absolute inset-0 bg-purple-500/30 dark:bg-purple-400/30 flex items-center justify-center z-20">
            <div className="bg-white dark:bg-gray-800 px-6 py-3 rounded-lg shadow-xl flex items-center gap-3 border-2 border-purple-400">
              <Camera size={24} className="text-purple-600 dark:text-purple-400" />
              <span className="text-base font-semibold text-purple-700 dark:text-purple-300">
                Drop image here
              </span>
            </div>
          </div>
        )}
        
        {/* Image Edit Overlay - only show when there's an image */}
        {allowImageEdit && !isDragOver && currentImage && (
          <label className="absolute inset-0 bg-black/30 dark:bg-black/50 flex items-center justify-center cursor-pointer group hover:bg-black/40 dark:hover:bg-black/60 transition-colors" title="Click to change image, or drag & drop, or paste" aria-label="Change image">
            <div className="bg-white dark:bg-gray-800 px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 group-hover:scale-105 transition-transform">
              <Camera size={20} className="text-gray-700 dark:text-gray-200" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                Change Image
              </span>
            </div>
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
              aria-label="Upload image"
            />
          </label>
        )}
      </div>

      {/* Bottom Half - Name & Description */}
      <div
        className={`p-5 shadow-lg rounded-b-2xl flex-1 flex flex-col min-h-0 ${
          useDarkPlacePanel
            ? 'bg-slate-900 text-white'
            : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100'
        }`}
      >
        {/* Search (Create mode only) */}
        {isCreateMode && (
          <div className="mb-3">
            <label className="block text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">
              Search Place
            </label>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => { 
                  const newValue = e.target.value;
                  setSearchQuery(newValue); 
                  setHighlightIndex(-1);
                  
                  // If user starts typing after selecting a place, allow new search
                  if (hasSelectedPlace.current && newValue.trim().length > 0) {
                    hasSelectedPlace.current = false; // Reset flag to allow new search
                    setFormData(prev => ({ ...prev, coords: [0, 0], name: '' }));
                  }
                }}
                onKeyDown={(e) => {
                  if (!suggestions.length) return;
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setHighlightIndex(i => Math.min(i + 1, suggestions.length - 1));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setHighlightIndex(i => Math.max(i - 1, 0));
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    const idx = highlightIndex === -1 ? 0 : highlightIndex;
                    const s = suggestions[idx];
                    if (s) {
                      const lat = parseFloat(s.lat);
                      const lon = parseFloat(s.lon);
                      const placeName = s.display_name.split(',')[0].trim();
                      
                      // Mark that place has been selected to prevent re-searching
                      hasSelectedPlace.current = true;
                      
                      // Update form data with selected place IMMEDIATELY
                      setFormData(prev => ({ 
                        ...prev, 
                        name: placeName,
                        coords: [lat, lon] 
                      }));
                      
                      // Clear search suggestions immediately - this prevents dropdown from showing again
                      setSuggestions([]);
                      setHighlightIndex(-1);
                      
                      // Update search query to show the selected place name
                      setSearchQuery(placeName);
                      
                      // Blur input immediately to close dropdown
                      setTimeout(() => {
                        if (searchInputRef.current) {
                          searchInputRef.current.blur();
                        }
                      }, 50);
                    }
                  }
                }}
                ref={searchInputRef}
                placeholder="Type at least 3 characters... e.g., Kochi"
                className="w-full p-3 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-gray-400 dark:focus:border-gray-600 transition-all"
              />
              {isSearching && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              )}
              {suggestions.length > 0 && (
                <div className="absolute z-50 mt-2 w-full rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-2xl max-h-60 overflow-auto backdrop-blur-sm">
                  {suggestions.map((s, idx) => (
                    <button
                      type="button"
                      key={`${s.display_name}-${idx}`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const lat = parseFloat(s.lat);
                        const lon = parseFloat(s.lon);
                        const placeName = s.display_name.split(',')[0].trim();
                        
                        // Mark that place has been selected to prevent re-searching
                        hasSelectedPlace.current = true;
                        
                        // Update form data with selected place IMMEDIATELY
                        setFormData(prev => ({ 
                          ...prev, 
                          name: placeName,
                          coords: [lat, lon] 
                        }));
                        
                        // Clear search suggestions immediately - this prevents dropdown from showing again
                        setSuggestions([]);
                        setHighlightIndex(-1);
                        
                        // Update search query to show the selected place name
                        setSearchQuery(placeName);
                        
                        // Blur input immediately to close dropdown
                        setTimeout(() => {
                          if (searchInputRef.current) {
                            searchInputRef.current.blur();
                          }
                        }, 50);
                      }}
                      onMouseDown={(e) => {
                        // Prevent input blur before click completes
                        e.preventDefault();
                      }}
                      className={`block w-full text-left px-4 py-3 text-sm text-gray-800 dark:text-gray-200 transition-colors ${highlightIndex === idx ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400' : 'hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                    >
                      {s.display_name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Place Name */}
        <div className="mb-3">
          {isCreateMode ? (
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
              className="w-full p-3 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-gray-400 dark:focus:border-gray-600 transition-all"
              placeholder="Place name"
            />
          ) : useDarkPlacePanel ? (
            <div className="flex items-center justify-between gap-2">
              <input
                type="text"
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                className="flex-1 min-w-0 rounded-lg border border-white/25 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/35"
                placeholder="Place name"
                aria-label="Place name"
              />
              <div className="flex flex-shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => setIsEditingImage(true)}
                  className="rounded-md p-2 text-white transition-colors hover:bg-white/20 dark:hover:bg-gray-700/30"
                  title="Change photo"
                  aria-label="Change photo"
                >
                  <Camera size={22} strokeWidth={2} />
                </button>
                {onDelete && (
                  <button
                    type="button"
                    onClick={onDelete}
                    className="rounded-md p-2 text-white transition-colors hover:bg-white/20 dark:hover:bg-gray-700/30"
                    title={`Delete ${currentName}`}
                    aria-label={`Delete ${currentName}`}
                  >
                    <Trash2 size={22} strokeWidth={2} />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <h3 className="truncate text-base font-semibold text-gray-800 dark:text-gray-100">
              {place?.name}
            </h3>
          )}
        </div>

        {/* Description */}
        <div className="min-h-[70px] mb-3">
          {isCreateMode ? (
            <textarea
              value={formData.description}
              onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
              className="w-full min-h-[70px] resize-none rounded-xl border border-gray-300 bg-white p-4 text-sm text-gray-900 transition-all placeholder:text-gray-400 focus:border-gray-400 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-gray-600"
              placeholder="Add a description..."
            />
          ) : useDarkPlacePanel ? (
            <textarea
              value={editedDescription}
              onChange={(e) => setEditedDescription(e.target.value)}
              className="w-full min-h-[70px] resize-none rounded-xl border border-white/25 bg-white/10 p-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/35"
              placeholder="Add a description..."
              aria-label="Description"
            />
          ) : place?.description ? (
            <p className="break-words text-sm leading-relaxed text-gray-600 dark:text-gray-300">
              {place.description}
            </p>
          ) : (
            <p className="text-sm italic text-gray-400 dark:text-gray-500">No description</p>
          )}
        </div>

        {!isCreateMode && transportEditable && useDarkPlacePanel && (
          <div className="mb-3">
            <label
              htmlFor="place-popup-transport"
              className="mb-1.5 block text-xs font-medium text-white/70"
            >
              Travel to this stop (map icon)
            </label>
            <select
              id="place-popup-transport"
              value={editedTransport}
              onChange={(e) => setEditedTransport(e.target.value as TransportMode)}
              className="w-full rounded-lg border border-white/25 bg-white/10 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/35 [&>option]:bg-gray-900 [&>option]:text-white"
              title="How you travel from the previous stop — updates the icon on the map"
              aria-label="Transport mode to this stop"
            >
              {TRANSPORT_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Save / Add */}
        {isCreateMode && (
          <div>
            <button
              onClick={handleSave}
              disabled={!formData.name.trim() || formData.coords[0] === 0 || formData.coords[1] === 0}
              className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2 font-semibold text-white shadow-md transition-colors disabled:cursor-not-allowed disabled:bg-gray-400"
              style={
                !formData.name.trim() || formData.coords[0] === 0 || formData.coords[1] === 0
                  ? {}
                  : { backgroundColor: tripColor }
              }
            >
              <span>Add Place</span>
            </button>
          </div>
        )}
        {!isCreateMode && onUpdate && (
          <button
            type="button"
            onClick={handleSave}
            className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-semibold text-white shadow-md transition-opacity hover:opacity-90"
            style={{ backgroundColor: tripColor }}
            title="Save changes"
          >
            <Save size={18} />
            <span>Save changes</span>
          </button>
        )}
      </div>
    </div>
  );

  // Both create and edit mode - show as simple popup at bottom left of map area (no backdrop)
  // Note: AnimatePresence is handled by parent component (App.tsx)
  return (
    <div className="fixed left-4 bottom-4 pointer-events-auto z-[9999]" style={{ marginLeft: `${sidebarWidth + 16}px` }}>
      <motion.div
        initial={{ opacity: 0, x: -20, y: 20 }}
        animate={{ opacity: 1, x: 0, y: 0 }}
        exit={{ opacity: 0, x: -20, y: 20 }}
        className="relative"
      >
        {/* Close button - X at top right inside box */}
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-2 right-2 w-7 h-7 bg-white hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-full flex items-center justify-center shadow-md border border-gray-200 dark:border-gray-600 transition-colors z-10"
            title="Close"
          >
            <X size={16} />
          </button>
        )}
        {popupContent}
      </motion.div>
    </div>
  );
};

export default PlacePopup;
