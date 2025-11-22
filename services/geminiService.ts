import { GoogleGenAI } from "@google/genai";
import type { Company, GroundingChunk } from '../types';

if (!process.env.API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

interface FindCompaniesResult {
  companies: Company[];
  groundingChunks: GroundingChunk[];
}

export const geocodeLocation = async (locationName: string): Promise<{ latitude: number; longitude: number }> => {
  const model = "gemini-2.5-flash";
  const prompt = `Provide the latitude and longitude for the following location in Kenya: "${locationName}".
  Return the result ONLY as a valid JSON object with "latitude" and "longitude" keys. Do not include any other text or formatting.
  Example: {"latitude": -1.286389, "longitude": 36.817223}`;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt
    });
    const text = response.text ? response.text.trim() : '';
    const jsonMatch = text.match(/\{.*\}/s);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error("Could not parse coordinates from response.");

  } catch (error) {
    console.error("Error geocoding location:", error);
    throw new Error(`Could not find coordinates for "${locationName}". Please try a different location name.`);
  }
};


export const findCompanies = async (
  categories: string[],
  radius: number,
  latitude: number,
  longitude: number,
  limit: number,
  customQuery?: string
): Promise<FindCompaniesResult> => {
  const model = "gemini-2.5-flash";

  let searchInstruction = "";
  if (customQuery && customQuery.trim() !== "") {
    searchInstruction = `The user is searching for: "${customQuery}".`;
    if (categories.length > 0) {
      searchInstruction += ` Consider the following categories as context or additional filters: ${categories.map(c => `"${c}"`).join(', ')}.`;
    }
  } else {
    searchInstruction = categories.length === 1
      ? `The category of companies to search for is "${categories[0]}".`
      : `The categories of companies to search for are ${categories.map(c => `"${c}"`).join(', ')}.`;
  }

  const prompt = `Find at least ${limit} companies in Kenya STRICTLY within a ${radius} km radius of latitude ${latitude} and longitude ${longitude}. ${searchInstruction}
  STRICT INSTRUCTION: You MUST return a list of MULTIPLE companies. Do not stop at one result. I need a comprehensive and EXHAUSTIVE list of at least ${limit} businesses if they exist.
  Restrict the desire to include businesses outside the ${radius} km radius. Be very precise with the location filtering.
  Provide a list of these companies. For each company, include its name (maximum 40 characters), its specific type of business (e.g., 'Restaurant', 'Hardware Shop'), locality, county, website (if available), contact information, a link to their Google Business Profile (if available), its precise latitude and longitude, and its user rating (a number from 1 to 5, if available).
  Return the result ONLY as a valid JSON array of objects. Each object should have the following keys: "name", "type", "locality", "county", "website", "contact", "google_maps_url", "latitude", "longitude", and "rating".
  If a piece of information is not available, use "N/A" for string fields and null for numeric fields like latitude, longitude, and rating. Do not include any introductory text or markdown formatting.`;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        tools: [{ googleMaps: {} }],
        toolConfig: {
          retrievalConfig: {
            latLng: {
              latitude: latitude,
              longitude: longitude,
            },
          },
        },
      },
    });

    const text = response.text ? response.text.trim() : '';
    let companies: Company[] = [];

    // Clean the response text to extract the JSON part
    const jsonMatch = text.match(/\[.*\]/s);
    if (jsonMatch) {
      companies = JSON.parse(jsonMatch[0]);
    } else {
      // Fallback if the response is not a clean JSON array
      console.warn("Response was not a clean JSON array. Attempting to parse anyway.");
      companies = JSON.parse(text);
    }

    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

    return { companies, groundingChunks: groundingChunks as GroundingChunk[] };

  } catch (error) {
    console.error("Error calling Gemini API:", error);
    if (error instanceof SyntaxError) {
      throw new Error("Failed to parse the response from the AI. The format might be unexpected.");
    }
    throw new Error("An error occurred while fetching company data.");
  }
};