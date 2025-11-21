import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import type { SavedSearch, Company } from '../types';
import { getSavedSearches, deleteSearch, updateSearch, saveSearch } from '../services/indexedDBService';
import CompanyTable from './CompanyCard';
import ConfirmDialog from './ConfirmDialog';
import AlertDialog from './AlertDialog';
import EnrichmentProgressModal from './EnrichmentProgressModal';
import { enrichCompaniesWithWebsites } from '../services/websiteEnrichmentService';
import type { EnrichmentProgress } from '../types';

const SavedSearchesPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
    const [selectedSearch, setSelectedSearch] = useState<SavedSearch | null>(null);
    const [loading, setLoading] = useState(true);
    const [editMode, setEditMode] = useState(false);
    const [editedSearch, setEditedSearch] = useState<SavedSearch | null>(null);
    const [selectedForMerge, setSelectedForMerge] = useState<string[]>([]);
    const [mergeMode, setMergeMode] = useState(false);
    const [showMergeModal, setShowMergeModal] = useState(false);
    const [mergeName, setMergeName] = useState('');

    // Dialog states
    const [confirmDialog, setConfirmDialog] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
        type?: 'danger' | 'warning' | 'info';
    }>({ isOpen: false, title: '', message: '', onConfirm: () => { } });

    const [alertDialog, setAlertDialog] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        type?: 'success' | 'error' | 'info';
    }>({ isOpen: false, title: '', message: '', type: 'info' });

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
        loadSavedSearches();
    }, []);

    const loadSavedSearches = async () => {
        setLoading(true);
        try {
            const searches = await getSavedSearches();
            setSavedSearches(searches);
        } catch (error) {
            console.error('Error loading saved searches:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string, searchName: string) => {
        setConfirmDialog({
            isOpen: true,
            title: 'Delete Search',
            message: `Are you sure you want to delete "${searchName}"?\n\nThis action cannot be undone.`,
            type: 'danger',
            onConfirm: async () => {
                setConfirmDialog({ ...confirmDialog, isOpen: false });
                try {
                    await deleteSearch(id);
                    setSavedSearches(prev => prev.filter(s => s.id !== id));
                    if (selectedSearch?.id === id) {
                        setSelectedSearch(null);
                    }
                    setAlertDialog({
                        isOpen: true,
                        title: 'Success',
                        message: `"${searchName}" has been deleted successfully.`,
                        type: 'success'
                    });
                } catch (error) {
                    console.error('Error deleting search:', error);
                    setAlertDialog({
                        isOpen: true,
                        title: 'Error',
                        message: 'Failed to delete search. Please try again.',
                        type: 'error'
                    });
                }
            }
        });
    };

    const handleExport = (search: SavedSearch) => {
        const dataToExport = search.companies.map(c => ({
            'Company Name': c.name,
            'Type of Business': c.type,
            'Locality': c.locality,
            'County': c.county,
            'Contact': c.contact,
            'Website': (c.website && c.website.toLowerCase() !== 'n/a') ? c.website : '',
            'Google Profile': (c.google_maps_url && c.google_maps_url.toLowerCase() !== 'n/a') ? c.google_maps_url : '',
            'Latitude': c.latitude,
            'Longitude': c.longitude,
            'Rating': c.rating,
        }));
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Businesses");
        XLSX.writeFile(workbook, `${search.name}.xlsx`);
    };

    const handleEditToggle = () => {
        if (editMode && editedSearch) {
            handleSaveEdit();
        } else {
            setEditMode(true);
            setEditedSearch(selectedSearch);
        }
    };

    const handleSaveEdit = async () => {
        if (!editedSearch) return;

        try {
            await updateSearch(editedSearch.id, editedSearch);
            setSavedSearches(prev => prev.map(s => s.id === editedSearch.id ? editedSearch : s));
            setSelectedSearch(editedSearch);
            setEditMode(false);
            setAlertDialog({
                isOpen: true,
                title: 'Success',
                message: 'Changes saved successfully!',
                type: 'success'
            });
        } catch (error) {
            console.error('Error saving changes:', error);
            setAlertDialog({
                isOpen: true,
                title: 'Error',
                message: 'Failed to save changes',
                type: 'error'
            });
        }
    };

    const handleRemoveCompany = (companyName: string) => {
        if (!editedSearch) return;
        const updatedCompanies = editedSearch.companies.filter(c => c.name !== companyName);
        setEditedSearch({ ...editedSearch, companies: updatedCompanies });
    };

    const handleToggleMergeSelection = (id: string) => {
        setSelectedForMerge(prev =>
            prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]
        );
    };

    const handleMergeSearches = async () => {
        if (selectedForMerge.length < 2) {
            setAlertDialog({
                isOpen: true,
                title: 'Error',
                message: 'Please select at least 2 searches to merge',
                type: 'error'
            });
            return;
        }

        if (!mergeName.trim()) {
            setAlertDialog({
                isOpen: true,
                title: 'Error',
                message: 'Please enter a name for the merged search',
                type: 'error'
            });
            return;
        }

        const searchesToMerge = savedSearches.filter(s => selectedForMerge.includes(s.id));

        const allCompanies: Company[] = [];
        const seenNames = new Set<string>();

        searchesToMerge.forEach(search => {
            search.companies.forEach(company => {
                if (!seenNames.has(company.name)) {
                    seenNames.add(company.name);
                    allCompanies.push(company);
                }
            });
        });

        const mergedSearch: SavedSearch = {
            id: `search_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: mergeName.trim(),
            timestamp: Date.now(),
            searchParams: searchesToMerge[0].searchParams,
            companies: allCompanies,
            filters: searchesToMerge[0].filters,
        };

        try {
            await saveSearch(mergedSearch);

            // Ask if user wants to delete the original searches
            const searchList = searchesToMerge.map(s => `• ${s.name}`).join('\n');
            setConfirmDialog({
                isOpen: true,
                title: 'Delete Original Searches?',
                message: `Merge successful! Created "${mergeName}" with ${allCompanies.length} unique companies.\n\nDo you want to delete the ${searchesToMerge.length} original searches?\n\n${searchList}`,
                type: 'warning',
                onConfirm: async () => {
                    setConfirmDialog({ ...confirmDialog, isOpen: false });
                    for (const search of searchesToMerge) {
                        await deleteSearch(search.id);
                    }
                    await loadSavedSearches();
                    setShowMergeModal(false);
                    setMergeMode(false);
                    setSelectedForMerge([]);
                    setMergeName('');
                    setAlertDialog({
                        isOpen: true,
                        title: 'Success',
                        message: 'Merge complete! Original searches have been deleted.',
                        type: 'success'
                    });
                }
            });

            // If user clicks cancel on delete confirmation
            await loadSavedSearches();
            setShowMergeModal(false);
            setMergeMode(false);
            setSelectedForMerge([]);
            setMergeName('');
        } catch (error) {
            console.error('Error merging searches:', error);
            setAlertDialog({
                isOpen: true,
                title: 'Error',
                message: 'Failed to merge searches. Please try again.',
                type: 'error'
            });
        }
    };

    const handleEnrichWithWebsites = async (search: SavedSearch) => {
        if (search.companies.length === 0) {
            setAlertDialog({
                isOpen: true,
                title: 'Info',
                message: 'No companies to enrich.',
                type: 'info'
            });
            return;
        }

        setIsEnriching(true);
        setShowEnrichmentModal(true);
        setEnrichmentProgress({
            total: search.companies.length,
            completed: 0,
            found: 0,
            notFound: 0,
            errors: 0,
        });

        try {
            const enrichedCompanies = await enrichCompaniesWithWebsites(
                search.companies,
                (progress) => {
                    setEnrichmentProgress(progress);
                },
                2000 // 2 second delay
            );

            // Update the search with enriched companies
            const updatedSearch = { ...search, companies: enrichedCompanies };
            await updateSearch(search.id, updatedSearch);

            // Update local state
            setSavedSearches(prev => prev.map(s => s.id === search.id ? updatedSearch : s));
            if (selectedSearch?.id === search.id) {
                setSelectedSearch(updatedSearch);
            }
            if (editedSearch?.id === search.id) {
                setEditedSearch(updatedSearch);
            }

            setAlertDialog({
                isOpen: true,
                title: 'Success',
                message: 'Enrichment complete! Companies updated with website information.',
                type: 'success'
            });

        } catch (error) {
            console.error('Error enriching companies:', error);
            setAlertDialog({
                isOpen: true,
                title: 'Error',
                message: 'Failed to enrich companies. Please try again.',
                type: 'error'
            });
        } finally {
            setIsEnriching(false);
        }
    };

    const formatDate = (timestamp: number) => {
        return new Date(timestamp).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    if (selectedSearch) {
        const displaySearch = editMode && editedSearch ? editedSearch : selectedSearch;

        return (
            <div className="max-w-7xl mx-auto px-4 py-8">
                <div className="mb-6">
                    <button
                        onClick={() => {
                            setSelectedSearch(null);
                            setEditMode(false);
                            setEditedSearch(null);
                        }}
                        className="flex items-center gap-2 text-indigo-600 hover:text-indigo-700 font-medium"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        Back to Saved Searches
                    </button>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-6">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">{displaySearch.name}</h1>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Saved on {formatDate(displaySearch.timestamp)}</p>
                            {editMode && <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">✏️ Edit Mode - Click companies to remove them</p>}
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={handleEditToggle}
                                className={`${editMode ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'} text-white px-4 py-2 rounded-lg flex items-center gap-2`}
                            >
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                                </svg>
                                {editMode ? 'Save Changes' : 'Edit'}
                            </button>
                            <button
                                onClick={() => handleExport(displaySearch)}
                                className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 flex items-center gap-2"
                            >
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                                </svg>
                                Export
                            </button>
                            <button
                                onClick={() => handleEnrichWithWebsites(displaySearch)}
                                disabled={isEnriching}
                                className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 flex items-center gap-2 disabled:bg-gray-400 disabled:cursor-not-allowed"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clipRule="evenodd" />
                                </svg>
                                {isEnriching ? 'Enriching...' : 'Enrich'}
                            </button>
                            <button
                                onClick={() => handleDelete(displaySearch.id, displaySearch.name)}
                                className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 flex items-center gap-2"
                            >
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                </svg>
                                Delete
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Categories</p>
                            <p className="font-semibold text-gray-900 dark:text-white">{displaySearch.searchParams.categories.join(', ')}</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Radius</p>
                            <p className="font-semibold text-gray-900 dark:text-white">{displaySearch.searchParams.radius} km</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Results</p>
                            <p className="font-semibold text-gray-900 dark:text-white">{displaySearch.companies.length} businesses</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Location</p>
                            <p className="font-semibold text-gray-900 dark:text-white">
                                {displaySearch.searchParams.location.latitude.toFixed(4)}, {displaySearch.searchParams.location.longitude.toFixed(4)}
                            </p>
                        </div>
                    </div>
                </div>

                {editMode ? (
                    <div className="space-y-4">
                        {displaySearch.companies.map((company, idx) => (
                            <div key={idx} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 flex justify-between items-center hover:shadow-lg transition-shadow">
                                <div>
                                    <h3 className="font-bold text-gray-900 dark:text-white">{company.name}</h3>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">{company.type} • {company.locality}</p>
                                </div>
                                <button
                                    onClick={() => handleRemoveCompany(company.name)}
                                    className="bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700 text-sm"
                                >
                                    Remove
                                </button>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
                        <CompanyTable
                            companies={displaySearch.companies}
                            currentPage={1}
                            itemsPerPage={displaySearch.companies.length}
                            totalCompanies={displaySearch.companies.length}
                            onPageChange={() => { }}
                        />
                    </div>
                )}

                {/* Confirm Dialog */}
                <ConfirmDialog
                    isOpen={confirmDialog.isOpen}
                    title={confirmDialog.title}
                    message={confirmDialog.message}
                    confirmText="Delete"
                    cancelText="Cancel"
                    type={confirmDialog.type}
                    onConfirm={confirmDialog.onConfirm}
                    onCancel={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
                />

                {/* Alert Dialog */}
                <AlertDialog
                    isOpen={alertDialog.isOpen}
                    title={alertDialog.title}
                    message={alertDialog.message}
                    type={alertDialog.type}
                    onClose={() => setAlertDialog({ ...alertDialog, isOpen: false })}
                />
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto px-4 py-8">
            <div className="mb-8">
                <button
                    onClick={onBack}
                    className="flex items-center gap-2 text-indigo-600 hover:text-indigo-700 font-medium mb-4"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Back to Search
                </button>
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-4xl font-bold text-gray-900 dark:text-white">Saved Searches</h1>
                        <p className="text-gray-600 dark:text-gray-400 mt-2">
                            {mergeMode ? 'Select searches to merge' : 'Manage your saved business searches'}
                        </p>
                    </div>
                    <div className="flex gap-3">
                        {mergeMode ? (
                            <>
                                <button
                                    onClick={() => {
                                        setMergeMode(false);
                                        setSelectedForMerge([]);
                                    }}
                                    className="bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-gray-700 flex items-center gap-2 font-medium"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => {
                                        if (selectedForMerge.length < 2) {
                                            setAlertDialog({
                                                isOpen: true,
                                                title: 'Error',
                                                message: 'Please select at least 2 searches to merge',
                                                type: 'error'
                                            });
                                            return;
                                        }
                                        setShowMergeModal(true);
                                    }}
                                    disabled={selectedForMerge.length < 2}
                                    className="bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 flex items-center gap-2 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                    </svg>
                                    Complete Merge ({selectedForMerge.length})
                                </button>
                            </>
                        ) : (
                            savedSearches.length >= 2 && (
                                <button
                                    onClick={() => setMergeMode(true)}
                                    className="bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 flex items-center gap-2 font-medium"
                                >
                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M3 4a1 1 0 011-1h4a1 1 0 010 2H6.414l2.293 2.293a1 1 0 11-1.414 1.414L5 6.414V8a1 1 0 01-2 0V4zm9 1a1 1 0 010-2h4a1 1 0 011 1v4a1 1 0 01-2 0V6.414l-2.293 2.293a1 1 0 11-1.414-1.414L13.586 5H12zm-9 7a1 1 0 012 0v1.586l2.293-2.293a1 1 0 111.414 1.414L6.414 15H8a1 1 0 010 2H4a1 1 0 01-1-1v-4zm13-1a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 010-2h1.586l-2.293-2.293a1 1 0 111.414-1.414L15 13.586V12a1 1 0 011-1z" clipRule="evenodd" />
                                    </svg>
                                    Merge Searches
                                </button>
                            )
                        )}
                    </div>
                </div>
            </div>

            {savedSearches.length === 0 ? (
                <div className="text-center p-12 bg-white dark:bg-gray-800 rounded-xl shadow-sm">
                    <div className="inline-block p-4 rounded-full bg-gray-100 dark:bg-gray-700 mb-4">
                        <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                        </svg>
                    </div>
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No Saved Searches</h3>
                    <p className="text-gray-500 dark:text-gray-400">Perform a search and click "Save" to save your results here.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {savedSearches.map((search) => (
                        <div
                            key={search.id}
                            className={`bg-white dark:bg-gray-800 rounded-xl shadow-lg hover:shadow-xl transition-all p-6 border-2 ${selectedForMerge.includes(search.id) ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20' : 'border-gray-200 dark:border-gray-700'
                                }`}
                        >
                            {mergeMode && (
                                <div className="mb-3">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={selectedForMerge.includes(search.id)}
                                            onChange={() => handleToggleMergeSelection(search.id)}
                                            className="form-checkbox h-5 w-5 text-purple-600 rounded"
                                        />
                                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Select for merge</span>
                                    </label>
                                </div>
                            )}

                            <div className="flex justify-between items-start mb-4">
                                <h3 className="text-xl font-bold text-gray-900 dark:text-white line-clamp-2">{search.name}</h3>
                            </div>

                            <div className="space-y-2 mb-4">
                                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    {formatDate(search.timestamp)}
                                </div>
                                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                    </svg>
                                    {search.companies.length} businesses
                                </div>
                                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                                    </svg>
                                    {search.searchParams.categories.join(', ')}
                                </div>
                            </div>

                            {!mergeMode && (
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setSelectedSearch(search)}
                                        className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 text-sm font-medium"
                                    >
                                        View
                                    </button>
                                    <button
                                        onClick={() => handleExport(search)}
                                        className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700"
                                        title="Export"
                                    >
                                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                                        </svg>
                                    </button>
                                    <button
                                        onClick={() => handleDelete(search.id, search.name)}
                                        className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
                                        title="Delete"
                                    >
                                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                        </svg>
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Merge Modal */}
            {showMergeModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6">
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Merge Searches</h2>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                            Merging {selectedForMerge.length} searches. Duplicate companies will be removed.
                        </p>
                        <input
                            type="text"
                            value={mergeName}
                            onChange={(e) => setMergeName(e.target.value)}
                            placeholder="Enter name for merged search..."
                            className="w-full px-4 py-3 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-purple-500 mb-4"
                        />
                        <div className="flex gap-3">
                            <button
                                onClick={() => {
                                    setShowMergeModal(false);
                                    setMergeName('');
                                }}
                                className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleMergeSearches}
                                disabled={!mergeName.trim()}
                                className="flex-1 px-4 py-3 bg-purple-600 text-white font-semibold rounded-xl hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Merge
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Confirm Dialog */}
            <ConfirmDialog
                isOpen={confirmDialog.isOpen}
                title={confirmDialog.title}
                message={confirmDialog.message}
                confirmText="Delete"
                cancelText="Cancel"
                type={confirmDialog.type}
                onConfirm={confirmDialog.onConfirm}
                onCancel={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
            />

            {/* Alert Dialog */}
            <AlertDialog
                isOpen={alertDialog.isOpen}
                title={alertDialog.title}
                message={alertDialog.message}
                type={alertDialog.type}
                onClose={() => setAlertDialog({ ...alertDialog, isOpen: false })}
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
        </div>
    );
};

export default SavedSearchesPage;
