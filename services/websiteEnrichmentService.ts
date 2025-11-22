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

    const enrichedCompanies: EnrichedCompany[] = [...companies] as EnrichedCompany[];
    const BATCH_SIZE = 3;

    for (let i = 0; i < companies.length; i += BATCH_SIZE) {
        const batch = companies.slice(i, i + BATCH_SIZE);

        await Promise.all(batch.map(async (company, index) => {
            const companyIndex = i + index;

            // Skip if already has website
            if (company.website && company.website !== 'N/A') {
                enrichedCompanies[companyIndex] = {
                    ...company,
                    websiteStatus: 'found',
                    websiteUrl: company.website
                };
                found++;
            } else {
                try {
                    // Call our local proxy server with company name and location
                    const response = await fetch('http://localhost:3001/api/enrich', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            company_name: company.name,
                            location: company.locality || company.county || 'Kenya',
                            company_type: company.type
                        })
                    });

                    const data = await response.json();

                    if (data.websiteUrl) {
                        enrichedCompanies[companyIndex] = {
                            ...company,
                            websiteStatus: 'found',
                            websiteUrl: data.websiteUrl,
                            website: data.websiteUrl, // Update original field too
                            websiteConfidence: data.confidence || 0
                        };
                        found++;
                    } else {
                        enrichedCompanies[companyIndex] = {
                            ...company,
                            websiteStatus: 'not_found',
                            websiteConfidence: data.confidence || 0
                        };
                        notFound++;
                    }
                } catch (error) {
                    console.error(`Error enriching ${company.name}:`, error);
                    enrichedCompanies[companyIndex] = {
                        ...company,
                        websiteStatus: 'error'
                    };
                    errors++;
                }
            }

            completed++;
            onProgress({
                total,
                completed,
                found,
                notFound,
                errors,
                currentBusiness: company.name
            });
        }));

        // Small delay between batches to be nice
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return enrichedCompanies;
};
