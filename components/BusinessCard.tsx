import React from 'react';
import type { Company } from '../types';

interface BusinessCardProps {
    company: Company;
}

const StarRating: React.FC<{ rating: number }> = ({ rating }) => {
    const fullStars = Math.floor(rating);
    const halfStar = rating - fullStars >= 0.5;
    const emptyStars = 5 - fullStars - (halfStar ? 1 : 0);

    return (
        <div className="flex items-center" title={`${rating.toFixed(1)} out of 5 stars`}>
            {[...Array(fullStars)].map((_, i) => <svg key={`full-${i}`} className="w-4 h-4 text-amber-400 fill-current" viewBox="0 0 20 20"><path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" /></svg>)}
            {halfStar && (
                <svg className="w-4 h-4 text-amber-400 fill-current" viewBox="0 0 20 20">
                    <defs><path id="half" d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0v15z" /></defs>
                    <use xlinkHref="#half" />
                    <use xlinkHref="#half" transform="scale(-1,1)" />
                </svg>
            )}
            {[...Array(emptyStars)].map((_, i) => <svg key={`empty-${i}`} className="w-4 h-4 text-gray-300 dark:text-gray-600 fill-current" viewBox="0 0 20 20"><path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" /></svg>)}
            <span className="ml-2 text-xs font-medium text-gray-600 dark:text-gray-400">({rating.toFixed(1)})</span>
        </div>
    );
};

const BusinessCard: React.FC<BusinessCardProps> = ({ company }) => {
    const hasWebsite = company.website && company.website.toLowerCase() !== 'n/a' && company.website.trim() !== '';
    const hasGmbUrl = company.google_maps_url && company.google_maps_url.toLowerCase() !== 'n/a' && company.google_maps_url.trim() !== '';

    return (
        <div className="glass-card rounded-xl p-6 flex flex-col h-full relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-indigo-500 to-purple-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>

            <div className="flex justify-between items-start mb-4">
                <div className="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-xs font-bold px-2 py-1 rounded uppercase tracking-wide">
                    {company.type}
                </div>
                {company.rating != null && (
                    <div className="bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded-lg">
                        <StarRating rating={company.rating} />
                    </div>
                )}
            </div>

            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 line-clamp-2 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                {company.name}
            </h3>

            <div className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400 mb-4 flex-grow">
                <svg className="w-4 h-4 mt-1 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                <span>{company.locality}, {company.county}</span>
            </div>

            <div className="space-y-2 pt-4 border-t border-gray-100 dark:border-gray-700/50">
                {company.contact && company.contact.toLowerCase() !== 'n/a' && (
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                        <span>{company.contact}</span>
                    </div>
                )}

                <div className="flex gap-2 mt-4">
                    {hasWebsite && (
                        <a href={company.website.startsWith('http') ? company.website : `https://${company.website}`} target="_blank" rel="noopener noreferrer" className="flex-1 text-center py-2 px-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors">
                            Website
                        </a>
                    )}
                    {hasGmbUrl && (
                        <a href={company.google_maps_url} target="_blank" rel="noopener noreferrer" className="flex-1 text-center py-2 px-3 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800 rounded-lg text-sm font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors">
                            Map
                        </a>
                    )}
                </div>
            </div>
        </div>
    );
};

export default BusinessCard;
