export interface Company {
  name: string;
  type: string;
  locality: string;
  county: string;
  website: string;
  contact: string;
  google_maps_url: string;
  latitude: number | null;
  longitude: number | null;
  rating?: number | null;
  distanceFromCenter?: number; // Distance in km from search center
}

export interface GeolocationState {
  latitude: number | null;
  longitude: number | null;
  error: string | null;
}

export interface GroundingChunk {
  maps?: {
    uri: string;
    title: string;
  };
}

export interface SavedSearch {
  id: string;
  name: string;
  timestamp: number;
  searchParams: SearchParams;
  companies: Company[];
  filters?: Filters;
}

export interface SearchParams {
  categories: string[];
  radius: number;
  location: LocationData;
  limit: number;
  customQuery?: string;
}

export interface LocationData {
  latitude: number;
  longitude: number;
  name?: string;
}

export interface Filters {
  minRating: number;
  hasWebsite: boolean;
  hasGoogleProfile: boolean;
}

// Website Enrichment Types
export interface EnrichedCompany extends Company {
  websiteUrl?: string;
  websiteStatus: 'found' | 'not_found' | 'pending' | 'error';
  websiteConfidence?: number; // 0-100 confidence score
  googleBusinessUrl?: string;
  googleBusinessData?: GoogleBusinessData;
  enrichedAt?: number;
  searchQuery?: string;
}

export interface GoogleBusinessData {
  rating?: number;
  reviewCount?: number;
  category?: string;
  hours?: string;
  phone?: string;
  address?: string;
  photos?: string[];
}

export interface EnrichmentProgress {
  total: number;
  completed: number;
  found: number;
  notFound: number;
  errors: number;
  currentBusiness?: string;
}

export interface EnrichmentResult {
  company: Company;
  websiteUrl?: string;
  websiteStatus: 'found' | 'not_found' | 'error';
  googleBusinessUrl?: string;
  googleBusinessData?: GoogleBusinessData;
  error?: string;
}