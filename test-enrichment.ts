import { enrichCompaniesWithWebsites } from './services/websiteEnrichmentService';
import { Company } from './types';

// Mock company with a known website (Java House)
const mockCompanies: Company[] = [
    {
        name: "Java House",
        type: "Cafe",
        locality: "Nairobi",
        county: "Nairobi",
        website: "N/A",
        contact: "N/A",
        google_maps_url: "https://www.google.com/maps/place/Java+House+Valley+Arcade/@-1.292696,36.768184,17z/data=!3m1!4b1!4m6!3m5!1s0x182f1a6bf74457a1:0x8a626d0026126169!8m2!3d-1.292696!4d36.7707589!16s%2Fg%2F11b6g9q_0?entry=ttu",
        latitude: -1.292696,
        longitude: 36.770759,
        rating: 4.4
    }
];

async function testEnrichment() {
    console.log("Starting enrichment test (DuckDuckGo Strategy)...");
    const enriched = await enrichCompaniesWithWebsites(
        mockCompanies,
        (progress) => console.log(`Progress: ${progress.completed}/${progress.total} - Found: ${progress.found}`),
        0
    );

    console.log("Enrichment Result:", JSON.stringify(enriched, null, 2));
}

testEnrichment();
