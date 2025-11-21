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
}

app.post('/api/enrich', async (req: Request<{}, {}, EnrichRequest>, res: Response) => {
    const { company_name, location } = req.body;

    if (!company_name || !location) {
        res.status(400).json({ error: 'Missing company_name or location' });
        return;
    }

    const cacheKey = `${company_name}-${location}`;
    // Check cache
    const cachedUrl = cache.get(cacheKey);
    if (cachedUrl !== undefined) {
        log(`[Cache Hit] ${company_name} -> ${cachedUrl}`);
        res.json({ websiteUrl: cachedUrl });
        return;
    }

    try {
        const userAgent = new UserAgent();
        const randomUserAgent = userAgent.random || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

        const query = `${company_name} ${location} official website`;
        const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

        log(`[Searching] ${query} with UA: ${randomUserAgent}`);

        const response = await axios.get(searchUrl, {
            headers: {
                'User-Agent': randomUserAgent,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
            },
            timeout: 15000,
        });

        const html = response.data;
        const $ = cheerio.load(html);
        log(`[Debug] Title: ${$('title').text()}`);

        let websiteUrl: string | null = null;

        // DuckDuckGo HTML structure usually has results in .result__a
        // We iterate through results to find the first non-directory link
        // Try multiple selectors as DDG HTML structure can vary
        const links = $('.result__a, .result__url, .links_main a');
        log(`[Debug] Found ${links.length} links`);

        links.each((_, element) => {
            const href = $(element).attr('href');
            if (href) {
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
                        // Fallback to simple split if URL parsing fails
                        const match = href.match(/uddg=([^&]+)/);
                        if (match && match[1]) {
                            candidateUrl = decodeURIComponent(match[1]);
                        }
                    }
                } else {
                    try {
                        candidateUrl = decodeURIComponent(href);
                    } catch (e) { }
                }

                log(`[Debug] Candidate: ${candidateUrl}`);

                // Filter out common directories and social media to find the "official" site
                if (
                    candidateUrl &&
                    !candidateUrl.includes('duckduckgo.com') &&
                    !candidateUrl.includes('facebook.com') &&
                    !candidateUrl.includes('instagram.com') &&
                    !candidateUrl.includes('yelp.com') &&
                    !candidateUrl.includes('tripadvisor.com') &&
                    !candidateUrl.includes('linkedin.com') &&
                    !candidateUrl.includes('yellowpages') &&
                    !candidateUrl.includes('jumia') &&
                    !candidateUrl.includes('jiiji') &&
                    !candidateUrl.includes('google.com') &&
                    !candidateUrl.includes('bing.com') &&
                    !candidateUrl.startsWith('/')
                ) {
                    websiteUrl = candidateUrl;
                    return false; // Found a good candidate, break
                }
            }
        });

        log(`[Result] ${company_name} -> ${websiteUrl || 'Not Found'}`);

        // Cache the result
        cache.set(cacheKey, websiteUrl, 3600);

        res.json({ websiteUrl });

    } catch (error: any) {
        log(`[Error] Failed to search for ${company_name}: ${error.message}`);
        res.status(500).json({ error: 'Failed to fetch data' });
    }
});

app.listen(port, () => {
    log(`Proxy server (PID: ${process.pid}) running at http://localhost:${port}`);
});
