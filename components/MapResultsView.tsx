import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { Company } from '../types';

interface MapResultsViewProps {
  companies: Company[];
  center: { lat: number; lng: number };
}

// Helper function to generate star rating HTML with inline styles
const generateStarRatingHTML = (rating: number): string => {
  const fullStarSVG = `<svg style="width:1rem; height:1rem; color: #facc15; display: inline-block;" fill="currentColor" viewBox="0 0 20 20"><path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z"/></svg>`;
  const halfStarSVG = `<svg style="width:1rem; height:1rem; color: #facc15; display: inline-block;" fill="currentColor" viewBox="0 0 20 20"><path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0v15z"/></svg>`;
  const emptyStarSVG = `<svg style="width:1rem; height:1rem; color: #D1D5DB; display: inline-block;" fill="currentColor" viewBox="0 0 20 20"><path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z"/></svg>`;

  const fullStars = Math.floor(rating);
  const halfStar = rating - fullStars >= 0.5;
  const emptyStars = 5 - fullStars - (halfStar ? 1 : 0);

  let starsHTML = '';
  for (let i = 0; i < fullStars; i++) starsHTML += fullStarSVG;
  if (halfStar) starsHTML += halfStarSVG;
  for (let i = 0; i < emptyStars; i++) starsHTML += emptyStarSVG;

  return `<div title="${rating.toFixed(1)} out of 5 stars" style="display: flex; align-items: center;">${starsHTML}<span style="margin-left: 0.5rem; font-size: 0.75rem; color: #4B5563;">(${rating.toFixed(1)})</span></div>`;
};


const MapResultsView: React.FC<MapResultsViewProps> = ({ companies, center }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);

  const validCompanies = companies.filter(c => c.latitude != null && c.longitude != null);

  useEffect(() => {
    if (mapContainerRef.current && !mapRef.current) {
      const map = L.map(mapContainerRef.current).setView([center.lat, center.lng], 12);
      mapRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(map);

      markersLayerRef.current = L.layerGroup().addTo(map);
    }
  }, []); // Run only once on mount

  useEffect(() => {
    if (markersLayerRef.current && mapRef.current) {
      markersLayerRef.current.clearLayers();

      if (validCompanies.length > 0) {
        const bounds = L.latLngBounds(validCompanies.map(c => [c.latitude!, c.longitude!]));
        mapRef.current.fitBounds(bounds, { padding: [50, 50] });

        validCompanies.forEach((company) => {
          const marker = L.marker([company.latitude!, company.longitude!]);

          let websiteLink = '';
          if (company.website && company.website.toLowerCase() !== 'n/a' && company.website.trim() !== '') {
            const url = company.website.startsWith('http') ? company.website : `https://${company.website}`;
            websiteLink = `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:#2563EB; text-decoration: none;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">Visit Website</a>`;
          }

          let googleProfileLink = '';
          const hasGmbUrl = company.google_maps_url && company.google_maps_url.toLowerCase() !== 'n/a' && company.google_maps_url.trim() !== '';
          if (hasGmbUrl) {
            googleProfileLink = `<a href="${company.google_maps_url}" target="_blank" rel="noopener noreferrer" style="color:#16A34A; text-decoration: none;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">View Profile</a>`;
          }

          const ratingHTML = company.rating != null ? generateStarRatingHTML(company.rating) : '<span style="color: #9CA3AF; font-size: 0.875rem;">Rating: N/A</span>';
          const contactText = (company.contact && company.contact.toLowerCase() !== 'n/a') ? company.contact : '';

          const links = [websiteLink, googleProfileLink].filter(Boolean).join('<span style="margin: 0 0.5rem;">|</span>');

          const popupContent = `
            <div style="font-family: sans-serif; min-width: 220px;">
              <h4 style="font-weight: bold; font-size: 1rem; margin-bottom: 0.1rem;">${company.name}</h4>
              <p style="font-style: italic; font-size: 0.8rem; color: #6B7280; margin: 0 0 0.5rem;">${company.type}</p>
              <div style="margin-bottom: 0.5rem;">${ratingHTML}</div>
              <p style="font-size: 0.875rem; color: #4B5563; margin: 0;">${company.locality}, ${company.county}</p>
              <p style="font-size: 0.875rem; color: #4B5563; margin: 0.25rem 0;">${contactText}</p>
              ${links ? `<div style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid #E5E7EB; font-size: 0.875rem;">${links}</div>` : ''}
            </div>
          `;

          marker.bindPopup(popupContent);
          markersLayerRef.current?.addLayer(marker);
        });
      } else {
        mapRef.current.setView([center.lat, center.lng], 12);
      }
    }
  }, [companies, center]);

  return (
    <div ref={mapContainerRef} className="h-[600px] w-full glass-card p-2 rounded-xl overflow-hidden border dark:border-gray-700">
      {/* Leaflet map will be mounted here */}
    </div>
  );
};

export default MapResultsView;