import { Company, EnrichmentProgress, EnrichedCompany } from '../types';

export const enrichCompaniesWithWebsites = async (
    companies: Company[],
    onProgress: (progress: EnrichmentProgress) => void,
    delay: number = 1000
): Promise<Company[]> => {
    const total = companies.length;
    let completed = 0;
    let found = 0;
    let notFound = 0;
    let errors = 0;

    const enrichedCompanies: EnrichedCompany[] = [];

    for (const company of companies) {
        // Simulate processing delay
        await new Promise(resolve => setTimeout(resolve, delay));

        // For now, we just pass through the company data
        // In a real implementation, this would call an API to find the website
        const enrichedCompany: EnrichedCompany = {
            ...company,
            websiteStatus: company.website && company.website !== 'N/A' ? 'found' : 'not_found',
            websiteUrl: company.website && company.website !== 'N/A' ? company.website : undefined
        };

        enrichedCompanies.push(enrichedCompany);

        completed++;
        if (enrichedCompany.websiteStatus === 'found') {
            found++;
        } else {
            notFound++;
        }

        onProgress({
            total,
            completed,
            found,
            notFound,
            errors,
            currentBusiness: company.name
        });
    }

    return enrichedCompanies;
};
