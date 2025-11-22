/**
 * Calculates the distance between two geographic coordinates using the Haversine formula
 * @param lat1 Latitude of first point in degrees
 * @param lon1 Longitude of first point in degrees
 * @param lat2 Latitude of second point in degrees
 * @param lon2 Longitude of second point in degrees
 * @returns Distance in kilometers
 */
export function calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRadians(lat1)) *
        Math.cos(toRadians(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return distance;
}

/**
 * Converts degrees to radians
 */
function toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
}

/**
 * Checks if a coordinate is within a specified radius of a center point
 * @param centerLat Center point latitude
 * @param centerLon Center point longitude
 * @param pointLat Point to check latitude
 * @param pointLon Point to check longitude
 * @param radiusKm Radius in kilometers
 * @returns true if point is within radius, false otherwise
 */
export function isWithinRadius(
    centerLat: number,
    centerLon: number,
    pointLat: number,
    pointLon: number,
    radiusKm: number
): boolean {
    const distance = calculateDistance(centerLat, centerLon, pointLat, pointLon);
    return distance <= radiusKm;
}
