import express, { Request, Response } from 'express';
import cors from 'cors';
import axios from 'axios';
import * as cheerio from 'cheerio';
import UserAgent from 'fake-useragent';
import NodeCache from 'node-cache';
import * as fs from 'fs';

const app = express();
const port = 3001;
const cache = new NodeCache({ stdTTL: 3600 }); // Cache for 1 hour

function log(message: string) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    console.log(message);
    try {
        fs.appendFileSync('proxy.log', logMessage);
    } catch (e) {
        console.error('Failed to write to log file:', e);
    }
}

process.on('uncaughtException', (err) => {
    log(`[Fatal] Uncaught Exception: ${err}`);
});

process.on('unhandledRejection', (reason, promise) => {
    log(`[Fatal] Unhandled Rejection at: ${promise} reason: ${reason}`);
});

app.use(cors());
app.use(express.json());

interface EnrichRequest {
    company_name: string;
    location: string;
    company_type?: string;
}

interface ScoredUrl {
    url: string;
    score: number;
}

// Known directory and listing sites to exclude
const DIRECTORY_SITES = [
    'duckduckgo.com', 'facebook.com', 'instagram.com', 'twitter.com', 'x.com',
    'yelp.com', 'tripadvisor.com', 'linkedin.com', 'yellowpages', 'jumia',
    'jiiji', 'google.com', 'bing.com', 'businesslist.co.ke', 'kenyaplex.com',
    'hotfrog.co.ke', 'cylex.co.ke', 'kenyanlist.com', 'locanto.co.ke',
    'pigiame.co.ke', 'jiji.co.ke', 'olx.co.ke'
];

function normalizeCompanyName(name: string): string {
    return name.toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .trim();
}

function scoreUrl(url: string, companyName: string): number {
    let score = 0;
    const urlLower = url.toLowerCase();
    const normalizedCompany = normalizeCompanyName(companyName);

    // Check if it's a directory site (heavy penalty)
    if (DIRECTORY_SITES.some(dir => urlLower.includes(dir))) {
        return -100;
    }

    // Bonus for .ke domains (Kenya-specific)
    if (urlLower.includes('.ke') || urlLower.includes('.co.ke')) {
        score += 20;
    }

    // Bonus if company name appears in domain
    if (normalizedCompany && urlLower.includes(normalizedCompany)) {
        score += 30;
    }

    // Bonus for common business TLDs
    if (urlLower.match(/\.(com|org|net|co\.ke|ke)$/)) {
        score += 10;
    }

    // Penalty for subdomains of known platforms
    if (urlLower.match(/\.(wordpress|wix|squarespace|blogspot|weebly)\./)) {
        score -= 5;
    }

    return score;
}

app.post('/api/enrich', async (req: Request<{}, {}, EnrichRequest>, res: Response) => {
    const { company_name, location, company_type } = req.body;

    if (!company_name || !location) {
        res.status(400).json({ error: 'Missing company_name or location' });
        return;
    }

    const cacheKey = `${company_name}-${location}`;
    const cachedResult = cache.get<{ websiteUrl: string | null; confidence: number }>(cacheKey);
    if (cachedResult !== undefined) {
        log(`[Cache Hit] ${company_name} -> ${cachedResult.websiteUrl || 'Not Found'} (confidence: ${cachedResult.confidence})`);
        res.json(cachedResult);
        return;
    }

    try {
        const userAgent = new UserAgent();
        const randomUserAgent = userAgent.random || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

        // Multi-query strategy: try different search queries in order of specificity
        const queries = [
            `"${company_name}" ${location} site:.ke`,
            `"${company_name}" ${location} -site:facebook.com -site:yelp.com -site:tripadvisor.com`,
            `${company_name} official website ${location}`,
        ];

        let bestCandidate: ScoredUrl | null = null;

        for (const query of queries) {
            const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
            log(`[Searching] ${query}`);

            try {
                const response = await axios.get(searchUrl, {
                    headers: {
                        'User-Agent': randomUserAgent,
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Cache-Control': 'no-cache',
                    },
                    timeout: 15000,
                });

                const html = response.data;
                const $ = cheerio.load(html);
                const links = $('.result__a, .result__url, .links_main a');

                const candidates: ScoredUrl[] = [];

                links.each((_, element) => {
                    const href = $(element).attr('href');
                    if (!href) return;

                    let candidateUrl = href;

                    // Handle DuckDuckGo redirect links
                    if (href.includes('uddg=')) {
                        try {
                            const urlObj = new URL(href, 'https://duckduckgo.com');
                            const uddg = urlObj.searchParams.get('uddg');
                            if (uddg) {
                                candidateUrl = decodeURIComponent(uddg);
                            }
                        } catch (e) {
                            const match = href.match(/uddg=([^&]+)/);
                            if (match && match[1]) {
                                candidateUrl = decodeURIComponent(match[1]);
                            }
                        }
                    }

                    // Basic URL validation
                    if (!candidateUrl.startsWith('http') && !candidateUrl.startsWith('/')) {
                        try {
                            candidateUrl = 'https://' + candidateUrl;
                        } catch (e) {
                            return;
                        }
                    }

                    if (candidateUrl.startsWith('/')) return; // Skip relative URLs

                    const score = scoreUrl(candidateUrl, company_name);
                    if (score > -50) { // Only consider URLs with positive-ish scores
                        candidates.push({ url: candidateUrl, score });
                        log(`[Candidate] ${candidateUrl} (score: ${score})`);
                    }
                });

                // Sort by score and pick the best
                candidates.sort((a, b) => b.score - a.score);
                if (candidates.length > 0 && candidates[0].score > (bestCandidate?.score || 0)) {
                    bestCandidate = candidates[0];
                }

                // If we found a high-confidence result, stop searching
                if (bestCandidate && bestCandidate.score >= 40) {
                    log(`[High Confidence] Found ${bestCandidate.url} with score ${bestCandidate.score}, stopping search`);
                    break;
                }

            } catch (queryError: any) {
                log(`[Query Error] ${query}: ${queryError.message}`);
                continue; // Try next query
            }
        }

        const websiteUrl = bestCandidate ? bestCandidate.url : null;
        const confidence = bestCandidate ? Math.min(100, Math.max(0, bestCandidate.score)) : 0;

        log(`[Result] ${company_name} -> ${websiteUrl || 'Not Found'} (confidence: ${confidence})`);

        const result = { websiteUrl, confidence };
        cache.set(cacheKey, result, 3600);

        res.json(result);

    } catch (error: any) {
        log(`[Error] Failed to search for ${company_name}: ${error.message}`);
        res.status(500).json({ error: 'Failed to fetch data' });
    }
});

app.listen(port, () => {
    log(`Proxy server (PID: ${process.pid}) running at http://localhost:${port}`);
});
