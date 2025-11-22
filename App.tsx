import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import type { Company, GeolocationState, GroundingChunk } from './types';
import { findCompanies, geocodeLocation } from './services/geminiService';
import { calculateDistance, isWithinRadius } from './utils/geoUtils';
import SearchBar from './components/SearchBar';
import CompanyTable from './components/CompanyCard';
import BusinessCard from './components/BusinessCard';
import Loader from './components/Loader';
import ErrorMessage from './components/ErrorMessage';
import MapResultsView from './components/MapResultsView';
import Layout from './components/Layout';
import Hero from './components/Hero';
import SaveSearchModal from './components/SaveSearchModal';
import SavedSearchesPage from './components/SavedSearchesPage';
import EnrichmentProgressModal from './components/EnrichmentProgressModal';
import { saveSearch, getAllSavedCompanyNames } from './services/indexedDBService';
import { enrichCompaniesWithWebsites } from './services/websiteEnrichmentService';
import type { SavedSearch, EnrichedCompany, EnrichmentProgress } from './types';

const ITEMS_PER_PAGE = 20;

const App: React.FC = () => {
  const [location, setLocation] = useState<GeolocationState>({
    latitude: null,
    longitude: null,
    error: null,
  });
  const [companies, setCompanies] = useState<Company[]>([]);
  const [groundingChunks, setGroundingChunks] = useState<GroundingChunk[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'table' | 'map' | 'grid'>('table');
  const [isSearchBarVisible, setIsSearchBarVisible] = useState(true);
  const lastScrollY = useRef(0);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const [filters, setFilters] = useState({
    minRating: 0,
    hasWebsite: false,
    hasGoogleProfile: false,
  });

  // Save functionality state
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [excludeSaved, setExcludeSaved] = useState(false);
  const [excludedCompanies, setExcludedCompanies] = useState<Company[]>([]);
  const [showSavedPage, setShowSavedPage] = useState(false);
  const [lastSearchParams, setLastSearchParams] = useState<{
    categories: string[];
    radius: number;
    limit: number;
    customQuery?: string;
  } | null>(null);

  // Enrichment state
  const [showEnrichmentModal, setShowEnrichmentModal] = useState(false);
  const [enrichmentProgress, setEnrichmentProgress] = useState<EnrichmentProgress>({
    total: 0,
    completed: 0,
    found: 0,
    notFound: 0,
    errors: 0,
  });
  const [isEnriching, setIsEnriching] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      if (Math.abs(currentScrollY - lastScrollY.current) < 20) {
        return;
      }
      if (currentScrollY > lastScrollY.current && currentScrollY > 150) {
        setIsSearchBarVisible(false);
      } else {
        setIsSearchBarVisible(true);
      }
      lastScrollY.current = currentScrollY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const handleFilterChange = (newFilters: Partial<typeof filters>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
    setCurrentPage(1);
  };

  const filteredCompanies = useMemo(() => {
    return companies.filter(company => {
      if (filters.hasWebsite) {
        const hasWebsite = company.website && company.website.toLowerCase() !== 'n/a' && company.website.trim() !== '';
        if (!hasWebsite) return false;
      }
      if (filters.hasGoogleProfile) {
        const hasGmbUrl = company.google_maps_url && company.google_maps_url.toLowerCase() !== 'n/a' && company.google_maps_url.trim() !== '';
        if (!hasGmbUrl) return false;
      }
      if (filters.minRating > 0) {
        if (company.rating == null || company.rating < filters.minRating) return false;
      }
      return true;
    });
  }, [companies, filters]);

  const paginatedCompanies = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredCompanies.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredCompanies, currentPage]);


  const updateLocation = (lat: number, lng: number, error: string | null = null) => {
    setLocation({ latitude: lat, longitude: lng, error });
    if (!error) {
      // Clear search-related errors when location is successfully updated
      setError(null);
    }
  };

  const handleGetInitialLocation = useCallback(() => {
    setLoading(true);
    if (!navigator.geolocation) {
      setLocation((prev) => ({ ...prev, error: 'Geolocation is not supported by your browser.' }));
      setLoading(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        updateLocation(position.coords.latitude, position.coords.longitude);
        setLoading(false);
      },
      () => {
        setLocation((prev) => ({ ...prev, error: 'Unable to retrieve your location. Please enable location services or search for a location manually.' }));
        setLoading(false);
      }
    );
  }, []);

  useEffect(() => {
    handleGetInitialLocation();
  }, [handleGetInitialLocation]);

  const handleLocationGeocode = async (locationName: string) => {
    setLoading(true);
    setError(null);
    try {
      const { latitude, longitude } = await geocodeLocation(locationName);
      updateLocation(latitude, longitude);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleMapLocationSelect = (lat: number, lng: number) => {
    updateLocation(lat, lng);
  };

  const handleSearch = useCallback(async (categories: string[], radius: number, limit: number, customQuery?: string) => {
    if (!location.latitude || !location.longitude) {
      setError("Your location is not set. Please use GPS, search, or select a location on the map.");
      return;
    }

    setLoading(true);
    setError(null);
    setHasSearched(true);
    setCompanies([]);
    setGroundingChunks([]);
    setExcludedCompanies([]);
    setCurrentPage(1);

    // Store search params for saving later
    setLastSearchParams({ categories, radius, limit, customQuery });

    try {
      const result = await findCompanies(categories, radius, location.latitude, location.longitude, limit, customQuery);
      let companies = result.companies;

      // CLIENT-SIDE RADIUS VALIDATION
      const centerLat = location.latitude;
      const centerLon = location.longitude;
      const filteredByRadius: Company[] = [];
      const outOfRadius: Company[] = [];

      companies.forEach(company => {
        if (company.latitude !== null && company.longitude !== null) {
          const distance = calculateDistance(centerLat, centerLon, company.latitude, company.longitude);

          if (distance <= radius) {
            filteredByRadius.push({
              ...company,
              distanceFromCenter: Math.round(distance * 10) / 10 // Round to 1 decimal
            });
          } else {
            outOfRadius.push(company);
          }
        } else {
          // Include companies without coordinates (shouldn't happen, but be safe)
          filteredByRadius.push(company);
        }
      });

      if (outOfRadius.length > 0) {
        console.log(`[Radius Filter] Removed ${outOfRadius.length} businesses outside ${radius}km radius:`,
          outOfRadius.map(c => `${c.name} (${c.locality})`));
      }

      companies = filteredByRadius;

      // Apply exclusion filter if enabled
      if (excludeSaved) {
        const savedNames = await getAllSavedCompanyNames();
        const excluded: Company[] = [];
        const filtered = companies.filter(c => {
          if (savedNames.includes(c.name)) {
            excluded.push(c);
            return false;
          }
          return true;
        });
        companies = filtered;
        setExcludedCompanies(excluded);
      }

      setCompanies(companies);
      setGroundingChunks(result.groundingChunks);
      setViewMode('table'); // Default to table view on new search
      if (companies.length === 0 && excludedCompanies.length === 0) {
        setError("No businesses found matching your criteria. Try a broader search.");
      }
    } catch (e: any) {
      setError(e.message || "An unknown error occurred.");
    } finally {
      setLoading(false);
    }
  }, [location.latitude, location.longitude, excludeSaved]);

  const handleDownload = () => {
    if (filteredCompanies.length === 0) return;
    const dataToExport = filteredCompanies.map(c => ({
      'Company Name': c.name, 'Type of Business': c.type, 'Locality': c.locality, 'County': c.county, 'Contact': c.contact,
      'Website': (c.website && c.website.toLowerCase() !== 'n/a') ? c.website : '',
      'Google Profile': (c.google_maps_url && c.google_maps_url.toLowerCase() !== 'n/a') ? c.google_maps_url : '',
      'Latitude': c.latitude, 'Longitude': c.longitude, 'Rating': c.rating,
    }));
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Businesses");
    XLSX.writeFile(workbook, "kenyan-businesses.xlsx");
  };

  const handleSaveSearch = async (name: string) => {
    if (!lastSearchParams || filteredCompanies.length === 0) return;

    setSaving(true);
    try {
      const savedSearch: SavedSearch = {
        id: `search_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name,
        timestamp: Date.now(),
        searchParams: {
          categories: lastSearchParams.categories,
          radius: lastSearchParams.radius,
          location: {
            latitude: location.latitude!,
            longitude: location.longitude!,
          },
          limit: lastSearchParams.limit,
          customQuery: lastSearchParams.customQuery,
        },
        companies: filteredCompanies,
        filters,
      };

      await saveSearch(savedSearch);
      setShowSaveModal(false);
      alert(`Search saved as "${name}"!`);
    } catch (error) {
      console.error('Error saving search:', error);
      alert('Failed to save search. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleEnrichWithWebsites = async () => {
    if (filteredCompanies.length === 0) {
      alert('No companies to enrich. Please perform a search first.');
      return;
    }

    setIsEnriching(true);
    setShowEnrichmentModal(true);
    setEnrichmentProgress({
      total: filteredCompanies.length,
      completed: 0,
      found: 0,
      notFound: 0,
      errors: 0,
    });

    try {
      const enrichedResults = await enrichCompaniesWithWebsites(
        filteredCompanies,
        (progress) => {
          setEnrichmentProgress(progress);
        },
        2000 // 2 second delay between requests
      );

      // Update companies with enriched data
      setCompanies(enrichedResults);
    } catch (error) {
      console.error('Error enriching companies:', error);
      alert('Failed to enrich companies. Please try again.');
    } finally {
      setIsEnriching(false);
    }
  };

  const handleRetryEnrichment = async () => {
    // Find companies that need retry: errors, not_found, or low confidence (<30)
    const companiesToRetry = filteredCompanies.filter(company => {
      const enriched = company as any;
      return (
        enriched.websiteStatus === 'error' ||
        enriched.websiteStatus === 'not_found' ||
        (enriched.websiteStatus === 'found' && (enriched.websiteConfidence || 0) < 30)
      );
    });

    if (companiesToRetry.length === 0) {
      alert('No companies need retry. All enrichments were successful!');
      return;
    }

    const confirmRetry = window.confirm(
      `Retry enrichment for ${companiesToRetry.length} businesses?\n\n` +
      `This includes:\n` +
      `- Errors: ${companiesToRetry.filter(c => (c as any).websiteStatus === 'error').length}\n` +
      `- Not Found: ${companiesToRetry.filter(c => (c as any).websiteStatus === 'not_found').length}\n` +
      `- Low Confidence: ${companiesToRetry.filter(c => (c as any).websiteStatus === 'found' && ((c as any).websiteConfidence || 0) < 30).length}`
    );

    if (!confirmRetry) return;

    setIsEnriching(true);
    setShowEnrichmentModal(true);
    setEnrichmentProgress({
      total: companiesToRetry.length,
      completed: 0,
      found: 0,
      notFound: 0,
      errors: 0,
    });

    try {
      const enrichedResults = await enrichCompaniesWithWebsites(
        companiesToRetry,
        (progress) => {
          setEnrichmentProgress(progress);
        },
        2000
      );

      // Merge retry results back into main companies array
      const updatedCompanies = companies.map(company => {
        const retryResult = enrichedResults.find(r => r.name === company.name);
        return retryResult || company;
      });

      setCompanies(updatedCompanies);

      const successCount = enrichedResults.filter(c => (c as any).websiteStatus === 'found').length;
      alert(`Retry complete! Found ${successCount} additional websites.`);
    } catch (error) {
      console.error('Error retrying enrichment:', error);
      alert('Failed to retry enrichment. Please try again.');
    } finally {
      setIsEnriching(false);
    }
  };

  const renderContent = () => {
    if (loading && companies.length === 0) return <Loader />;
    if (error && companies.length === 0 && hasSearched) return <ErrorMessage message={error} />;

    if (companies.length > 0) {
      return (
        <div className="animate-fade-in">
          <div className="flex flex-col md:flex-row justify-between items-center mb-6 px-2 gap-4">
            <div>
              <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Search Results</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Found {filteredCompanies.length} businesses near you{excludedCompanies.length > 0 && ` | ${excludedCompanies.length} excluded`}
              </p>
            </div>
            <div className="flex items-center gap-4 w-full md:w-auto">
              <div className="flex rounded-lg shadow-sm bg-white dark:bg-gray-800 p-1 border border-gray-200 dark:border-gray-700" role="group">
                <button onClick={() => setViewMode('grid')} type="button" className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${viewMode === 'grid' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}>
                  Grid
                </button>
                <button onClick={() => setViewMode('table')} type="button" className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${viewMode === 'table' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}>
                  Table
                </button>
                <button onClick={() => setViewMode('map')} type="button" className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${viewMode === 'map' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}>
                  Map
                </button>
              </div>
              <button onClick={() => setShowSaveModal(true)} disabled={filteredCompanies.length === 0} className="bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 flex items-center disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors shadow-sm">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"><path d="M7.707 10.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V6h5a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2h5v5.586l-1.293-1.293zM9 4a1 1 0 012 0v2H9V4z" /></svg>
                Save
              </button>
              <button onClick={handleDownload} disabled={filteredCompanies.length === 0} className="bg-emerald-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-emerald-700 focus:ring-2 focus:ring-emerald-500 flex items-center disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors shadow-sm">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                Export
              </button>
              <button onClick={handleEnrichWithWebsites} disabled={filteredCompanies.length === 0 || isEnriching} className="bg-purple-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-purple-700 focus:ring-2 focus:ring-purple-500 flex items-center disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors shadow-sm">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clipRule="evenodd" /></svg>
                {isEnriching ? 'Enriching...' : 'Enrich with Websites'}
              </button>
              <button
                onClick={handleRetryEnrichment}
                disabled={filteredCompanies.length === 0 || isEnriching || !filteredCompanies.some(c => {
                  const enriched = c as any;
                  return enriched.websiteStatus === 'error' || enriched.websiteStatus === 'not_found' || (enriched.websiteStatus === 'found' && (enriched.websiteConfidence || 0) < 30);
                })}
                className="bg-amber-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-amber-700 focus:ring-2 focus:ring-amber-500 flex items-center disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors shadow-sm"
                title="Retry enrichment for failed or low-confidence results"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" /></svg>
                Retry Failed
              </button>
            </div>
          </div>

          {filteredCompanies.length > 0 ? (
            <>
              {viewMode === 'grid' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {paginatedCompanies.map((company, idx) => (
                    <BusinessCard key={idx} company={company} />
                  ))}
                </div>
              )}
              {viewMode === 'table' && (
                <CompanyTable
                  companies={paginatedCompanies}
                  currentPage={currentPage}
                  itemsPerPage={ITEMS_PER_PAGE}
                  totalCompanies={filteredCompanies.length}
                  onPageChange={setCurrentPage}
                />
              )}
              {viewMode === 'map' && location.latitude && location.longitude && (
                <div className="bg-white dark:bg-gray-800 p-2 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
                  <MapResultsView companies={filteredCompanies} center={{ lat: location.latitude, lng: location.longitude }} />
                </div>
              )}

              {/* Pagination for Grid View */}
              {viewMode === 'grid' && filteredCompanies.length > ITEMS_PER_PAGE && (
                <div className="mt-8 flex justify-center">
                  <nav className="flex items-center gap-2">
                    <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-800">Previous</button>
                    <span className="text-gray-600 dark:text-gray-400">Page {currentPage} of {Math.ceil(filteredCompanies.length / ITEMS_PER_PAGE)}</span>
                    <button onClick={() => setCurrentPage(p => Math.min(Math.ceil(filteredCompanies.length / ITEMS_PER_PAGE), p + 1))} disabled={currentPage === Math.ceil(filteredCompanies.length / ITEMS_PER_PAGE)} className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-800">Next</button>
                  </nav>
                </div>
              )}
            </>
          ) : (
            <div className="text-center p-12 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
              <div className="inline-block p-4 rounded-full bg-gray-100 dark:bg-gray-700 mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">No matching businesses</h3>
              <p className="text-gray-500 dark:text-gray-400 mt-2">Try adjusting your filters to see more results.</p>
            </div>
          )}

          {/* Excluded Companies Section */}
          {excludedCompanies.length > 0 && (
            <div className="mt-8 p-6 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800">
              <div className="flex items-center gap-2 mb-4">
                <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                <h3 className="text-lg font-bold text-amber-900 dark:text-amber-100">Excluded Companies ({excludedCompanies.length})</h3>
              </div>
              <p className="text-sm text-amber-800 dark:text-amber-200 mb-4">These companies were excluded because they already exist in your saved searches.</p>
              <div className="bg-white dark:bg-gray-800 rounded-lg overflow-hidden border border-amber-200 dark:border-amber-700">
                <CompanyTable
                  companies={excludedCompanies}
                  currentPage={1}
                  itemsPerPage={excludedCompanies.length}
                  totalCompanies={excludedCompanies.length}
                  onPageChange={() => { }}
                />
              </div>
            </div>
          )}
        </div>
      );
    }

    if (hasSearched && !loading) {
      return (
        <div className="text-center p-12 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="inline-block p-4 rounded-full bg-gray-100 dark:bg-gray-700 mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white">No Results Found</h3>
          <p className="text-gray-500 dark:text-gray-400 mt-2">We couldn't find any businesses matching your search criteria.</p>
        </div>
      )
    }

    return <Hero />;
  };

  const handleHome = () => {
    setHasSearched(false);
    setCompanies([]);
    setGroundingChunks([]);
    setExcludedCompanies([]);
    setShowSavedPage(false);
    setError(null);
    // Reset search bar if needed, or keep location
  };

  return (
    <Layout onViewSaved={() => setShowSavedPage(true)} onHome={handleHome}>
      {showSavedPage ? (
        <SavedSearchesPage onBack={() => setShowSavedPage(false)} />
      ) : (
        <div className="flex flex-col lg:flex-row gap-8 min-h-[80vh]">
          {/* Sidebar */}
          <aside className="w-full lg:w-1/3 xl:w-1/4 flex-shrink-0">
            <div className="sticky top-24">
              <SearchBar
                onSearch={handleSearch}
                hasSearched={hasSearched}
                loading={loading}
                isLocationSet={!!location.latitude}
                currentLocation={location}
                onLocationGeocode={handleLocationGeocode}
                onUseCurrentLocation={handleGetInitialLocation}
                onMapLocationSelect={handleMapLocationSelect}
                resultsCount={companies.length}
                filters={filters}
                onFilterChange={handleFilterChange}
                excludeSaved={excludeSaved}
                onExcludeSavedChange={setExcludeSaved}
              />
              {location.error && <div className="mt-4"><ErrorMessage message={location.error} /></div>}
            </div>
          </aside>

          {/* Main Content */}
          <main className="w-full lg:w-2/3 xl:w-3/4 space-y-8">
            {renderContent()}

            {groundingChunks.length > 0 && (
              <div className="mt-12 p-6 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
                <h4 className="font-semibold text-sm text-gray-600 dark:text-gray-400 mb-3 uppercase tracking-wider">Data Sources</h4>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {groundingChunks.map((chunk, index) =>
                    chunk.maps ? (
                      <li key={index} className="flex items-center gap-2">
                        <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                        <a href={chunk.maps.uri} target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-indigo-400 hover:underline truncate">
                          {chunk.maps.title}
                        </a>
                      </li>
                    ) : null
                  )}
                </ul>
              </div>
            )}
          </main>
        </div>
      )}

      {/* Save Search Modal */}
      <SaveSearchModal
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        onSave={handleSaveSearch}
        loading={saving}
      />

      {/* Enrichment Progress Modal */}
      <EnrichmentProgressModal
        isOpen={showEnrichmentModal}
        progress={enrichmentProgress}
        onCancel={() => {
          if (!isEnriching) {
            setShowEnrichmentModal(false);
          }
        }}
      />
    </Layout>
  );
};

export default App;
