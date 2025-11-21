import React, { useState, useRef, useEffect } from 'react';
import L from 'leaflet';

interface SearchBarProps {
  onSearch: (categories: string[], radius: number, limit: number) => void;
  hasSearched: boolean;
  loading: boolean;
  isLocationSet: boolean;
  onLocationGeocode: (locationName: string) => void;
  onUseCurrentLocation: () => void;
  onMapLocationSelect: (lat: number, lng: number) => void;
  currentLocation: { latitude: number | null, longitude: number | null };
  resultsCount: number;
  filters: {
    minRating: number;
    hasWebsite: boolean;
    hasGoogleProfile: boolean;
  };
  onFilterChange: (newFilters: { [key: string]: any }) => void;
  excludeSaved: boolean;
  onExcludeSavedChange: (exclude: boolean) => void;
}

const KENYAN_BUSINESS_CATEGORIES = [
  'Agriculture', 'Banks & Financial Services', 'Beauty & Salons', 'Car Repair & Garages',
  'Clothing & Apparel', 'Construction', 'Electronics', 'Entertainment & Recreation',
  'Hardware Stores', 'Hospitals & Clinics', 'Hotels & Lodging', 'IT & Tech Companies',
  'Pharmacies', 'Real Estate Agencies', 'Restaurants', 'Schools & Colleges',
  'Shopping Malls', 'Supermarkets & Groceries', 'Travel & Tourism',
];

const getZoomLevelForRadius = (radiusKm: number): number => {
  if (radiusKm <= 2) return 14;
  if (radiusKm <= 5) return 13;
  if (radiusKm <= 10) return 12;
  if (radiusKm <= 25) return 11;
  if (radiusKm <= 50) return 10;
  if (radiusKm <= 100) return 9;
  if (radiusKm <= 200) return 8;
  return 7; // for radius up to 300km
};

const SearchBar: React.FC<SearchBarProps> = ({ onSearch, hasSearched, loading, isLocationSet, onLocationGeocode, onUseCurrentLocation, onMapLocationSelect, currentLocation, resultsCount, filters, onFilterChange, excludeSaved, onExcludeSavedChange }) => {
  const [categories, setCategories] = useState<string[]>(['Restaurants']);
  const [radius, setRadius] = useState<number>(5);
  const [limit, setLimit] = useState<number>(10);
  const [isLimitless, setIsLimitless] = useState<boolean>(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [locationSearch, setLocationSearch] = useState('');
  const [isLocationExpanded, setIsLocationExpanded] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const radiusCircleRef = useRef<L.Circle | null>(null);

  const mapCenter = {
    lat: currentLocation.latitude ?? -1.286389, // Default to Nairobi
    lng: currentLocation.longitude ?? 36.817223,
  };

  useEffect(() => {
    if (hasSearched) {
      setIsLocationExpanded(false);
    }
  }, [hasSearched]);

  useEffect(() => {
    // Only initialize map if it is expanded and the container is ready
    if (isLocationExpanded && mapContainerRef.current && !mapRef.current) {
      const map = L.map(mapContainerRef.current).setView([mapCenter.lat, mapCenter.lng], 13);
      mapRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(map);

      const marker = L.marker([mapCenter.lat, mapCenter.lng]).addTo(map);
      markerRef.current = marker;

      const circle = L.circle([mapCenter.lat, mapCenter.lng], {
        radius: radius * 1000,
        color: '#4F46E5',
        fillColor: '#4F46E5',
        fillOpacity: 0.1,
        weight: 1,
      }).addTo(map);
      radiusCircleRef.current = circle;

      map.on('click', (e: L.LeafletMouseEvent) => {
        const { lat, lng } = e.latlng;
        onMapLocationSelect(lat, lng);
      });
    } else if (!isLocationExpanded && mapRef.current) {
      // Clean up map instance when collapsed to prevent issues
      mapRef.current.remove();
      mapRef.current = null;
      markerRef.current = null;
      radiusCircleRef.current = null;
    }
  }, [isLocationExpanded]); // Rerun when expansion state changes

  useEffect(() => {
    if (mapRef.current && markerRef.current && radiusCircleRef.current) {
      const newLatLng = L.latLng(mapCenter.lat, mapCenter.lng);
      // Check if the map needs to be moved to avoid jitter when clicking
      if (!mapRef.current.getCenter().equals(newLatLng, 1e-4)) {
        mapRef.current.flyTo(newLatLng, 13);
      }
      markerRef.current.setLatLng(newLatLng);
      radiusCircleRef.current.setLatLng(newLatLng);
    }
  }, [mapCenter.lat, mapCenter.lng]);

  useEffect(() => {
    if (radiusCircleRef.current) {
      radiusCircleRef.current.setRadius(radius * 1000);
    }
    if (mapRef.current) {
      const newZoom = getZoomLevelForRadius(radius);
      if (mapRef.current.getZoom() !== newZoom) {
        mapRef.current.flyTo(mapRef.current.getCenter(), newZoom);
      }
    }
  }, [radius]);


  const handleCategoryToggle = (category: string) => {
    setCategories(prev => prev.includes(category) ? prev.filter(c => c !== category) : [...prev, category]);
  };

  const handleMainSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const searchLimit = isLimitless ? 500 : limit;
    if (categories.length > 0 && radius > 0 && searchLimit > 0 && isLocationSet) {
      onSearch(categories, radius, searchLimit);
      setIsDropdownOpen(false);
    }
  };

  const handleLocationSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (locationSearch) {
      onLocationGeocode(locationSearch);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getCategoryButtonText = () => {
    if (categories.length === 0) return 'Select Categories';
    if (categories.length === 1) return categories[0];
    return `${categories.length} categories selected`;
  };

  return (
    <div className="glass rounded-2xl p-6 w-full space-y-6 border border-white/40 dark:border-gray-700/40 shadow-xl">
      {/* Location Section */}
      <div className="bg-white/50 dark:bg-gray-800/50 rounded-xl p-4 border border-gray-100 dark:border-gray-700 transition-all duration-300 hover:shadow-md">
        <div
          className="flex justify-between items-center cursor-pointer"
          onClick={() => setIsLocationExpanded(!isLocationExpanded)}
          role="button"
          aria-expanded={isLocationExpanded}
        >
          <div className="flex items-center gap-3">
            <div className="bg-indigo-100 dark:bg-indigo-900/50 p-2 rounded-lg text-indigo-600 dark:text-indigo-400">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </div>
            <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">
              Location
            </h2>
          </div>
          <div className={`transform transition-transform duration-300 ${isLocationExpanded ? 'rotate-180' : ''} text-gray-500`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </div>
        </div>

        <div className={`grid transition-all duration-500 ease-in-out ${isLocationExpanded ? 'grid-rows-[1fr] opacity-100 mt-4' : 'grid-rows-[0fr] opacity-0 mt-0'}`}>
          <div className="overflow-hidden space-y-4">
            <form onSubmit={handleLocationSearchSubmit} className="flex flex-col gap-3">
              <div className="relative w-full">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </div>
                <input
                  type="text"
                  id="location"
                  value={locationSearch}
                  onChange={(e) => setLocationSearch(e.target.value)}
                  placeholder="Search location..."
                  className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all shadow-sm text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={loading || !locationSearch} className="flex-1 py-2 bg-gray-800 dark:bg-gray-700 text-white text-sm font-semibold rounded-xl hover:bg-gray-900 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm">
                  Search
                </button>
                <button type="button" onClick={onUseCurrentLocation} disabled={loading} className="flex-1 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm flex items-center justify-center gap-2 whitespace-nowrap">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  GPS
                </button>
              </div>
            </form>

            <div className="bg-white dark:bg-gray-900 p-3 rounded-xl border border-gray-200 dark:border-gray-700">
              <label htmlFor="radius" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 flex justify-between">
                <span>Radius</span>
                <span className="text-indigo-600 dark:text-indigo-400 font-bold">{radius} km</span>
              </label>
              <input
                type="range"
                id="radius-slider"
                value={radius}
                onChange={(e) => setRadius(Number(e.target.value))}
                min="1"
                max="300"
                className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-600"
              />
            </div>

            <div ref={mapContainerRef} className="h-48 w-full rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 shadow-inner relative">
              {!mapRef.current && <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-gray-400 text-sm">Loading Map...</div>}
            </div>
            <p className="text-xs text-center text-gray-500 dark:text-gray-400">Click map to pin location</p>
          </div>
        </div>
      </div>

      {/* Search Criteria Section */}
      <form onSubmit={handleMainSearchSubmit} className="space-y-6">
        <div className="flex flex-col gap-4">
          {/* Category Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 ml-1">Category</label>
            <button type="button" onClick={() => setIsDropdownOpen(!isDropdownOpen)} className="w-full px-4 py-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 text-left flex justify-between items-center shadow-sm hover:border-indigo-300 transition-colors">
              <span className={`truncate text-sm ${categories.length === 0 ? 'text-gray-400' : 'text-gray-800 dark:text-gray-200'}`}>{getCategoryButtonText()}</span>
              <svg className={`w-5 h-5 ml-2 text-gray-400 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </button>

            {isDropdownOpen && (
              <div className="absolute z-30 w-full mt-2 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl shadow-xl max-h-60 overflow-y-auto animate-fade-in-down">
                <div className="p-2 grid grid-cols-1 gap-1">
                  {KENYAN_BUSINESS_CATEGORIES.map(c => (
                    <label key={c} className="flex items-center space-x-3 w-full p-2 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30 cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={categories.includes(c)}
                        onChange={() => handleCategoryToggle(c)}
                        className="form-checkbox h-4 w-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                      />
                      <span className="text-xs text-gray-700 dark:text-gray-200">{c}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Limit Input */}
          <div>
            <label htmlFor="limit" className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 ml-1">Max Results</label>
            <div className="flex items-center gap-2 bg-white dark:bg-gray-900 p-1.5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
              <input
                type="number"
                id="limit"
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                min="1"
                max="200"
                className="w-full px-3 py-1.5 bg-transparent border-none focus:ring-0 text-gray-800 dark:text-gray-200 disabled:opacity-50 text-sm"
                required
                disabled={isLimitless}
              />
              <div className="h-6 w-px bg-gray-200 dark:bg-gray-700"></div>
              <label className="flex items-center space-x-2 cursor-pointer whitespace-nowrap px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors">
                <input
                  type="checkbox"
                  checked={isLimitless}
                  onChange={(e) => setIsLimitless(e.target.checked)}
                  className="form-checkbox h-4 w-4 text-indigo-600 rounded focus:ring-indigo-500"
                />
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400">All</span>
              </label>
            </div>
          </div>

          {/* Exclude Saved Checkbox */}
          <label className="flex items-center space-x-3 cursor-pointer px-4 py-3 rounded-lg border transition-all bg-white border-gray-200 text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-700">
            <input
              type="checkbox"
              checked={excludeSaved}
              onChange={(e) => onExcludeSavedChange(e.target.checked)}
              className="form-checkbox h-4 w-4 text-indigo-600 rounded focus:ring-indigo-500"
            />
            <span className="text-sm font-medium">Exclude previously saved results</span>
          </label>

          {/* Main Search Button */}
          <button type="submit" disabled={loading || !isLocationSet || categories.length === 0} className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold py-3 px-6 rounded-xl hover:from-indigo-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-lg shadow-indigo-500/30 transform hover:-translate-y-0.5 transition-all duration-200">
            {loading ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                Searching...
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" /></svg>
                Find Businesses
              </>
            )}
          </button>
        </div>
      </form>

      {/* Filter Results Section */}
      {hasSearched && resultsCount > 0 && (
        <div className="border-t border-gray-200/60 dark:border-gray-700/60 pt-6 animate-fade-in">
          <div className="flex items-center gap-2 mb-4">
            <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
            <h2 className="text-lg font-bold text-gray-800 dark:text-gray-200">Filters</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="rating-filter" className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Min Rating</label>
              <div className="relative">
                <select
                  id="rating-filter"
                  value={filters.minRating}
                  onChange={(e) => onFilterChange({ minRating: Number(e.target.value) })}
                  className="w-full pl-4 pr-10 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 appearance-none cursor-pointer text-sm"
                >
                  <option value="0">Any Rating</option>
                  <option value="4.5">4.5+ Stars</option>
                  <option value="4">4.0+ Stars</option>
                  <option value="3.5">3.5+ Stars</option>
                  <option value="3">3.0+ Stars</option>
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className={`flex items-center space-x-3 cursor-pointer px-4 py-2 rounded-lg border transition-all ${filters.hasWebsite ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-800 dark:text-indigo-300' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400'}`}>
                <input
                  type="checkbox"
                  checked={filters.hasWebsite}
                  onChange={(e) => onFilterChange({ hasWebsite: e.target.checked })}
                  className="form-checkbox h-4 w-4 text-indigo-600 rounded focus:ring-indigo-500"
                />
                <span className="text-sm font-medium">Has Website</span>
              </label>
              <label className={`flex items-center space-x-3 cursor-pointer px-4 py-2 rounded-lg border transition-all ${filters.hasGoogleProfile ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/30 dark:border-emerald-800 dark:text-emerald-300' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400'}`}>
                <input
                  type="checkbox"
                  checked={filters.hasGoogleProfile}
                  onChange={(e) => onFilterChange({ hasGoogleProfile: e.target.checked })}
                  className="form-checkbox h-4 w-4 text-emerald-600 rounded focus:ring-emerald-500"
                />
                <span className="text-sm font-medium">Has Google Profile</span>
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchBar;