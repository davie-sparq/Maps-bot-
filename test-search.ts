import fs from 'fs';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) {
            process.env[key.trim()] = value.trim();
        }
    });
}

// Map GEMINI_API_KEY to API_KEY if needed
if (process.env.GEMINI_API_KEY && !process.env.API_KEY) {
    process.env.API_KEY = process.env.GEMINI_API_KEY;
}

async function testSearch() {
    try {
        // Dynamic import after env vars are set
        const { findCompanies } = await import('./services/geminiService');

        console.log("Starting search test...");
        const result = await findCompanies(['Restaurants'], 5, -1.286389, 36.817223, 5);
        console.log(`Found ${result.companies.length} companies.`);
        console.log("First company:", JSON.stringify(result.companies[0], null, 2));
    } catch (error) {
        console.error("Search failed:", error);
    }
}

testSearch();
