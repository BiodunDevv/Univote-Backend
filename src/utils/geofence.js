/**
 * Calculate distance between two geographic coordinates using Haversine formula
 * @param {number} lat1 - Latitude of first point
 * @param {number} lng1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lng2 - Longitude of second point
 * @returns {number} Distance in meters
 */
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

/**
 * Check if a location is within a geofence
 * @param {number} userLat - User's latitude
 * @param {number} userLng - User's longitude
 * @param {number} centerLat - Geofence center latitude
 * @param {number} centerLng - Geofence center longitude
 * @param {number} radiusMeters - Geofence radius in meters
 * @returns {boolean} True if within geofence
 */
function isWithinGeofence(
  userLat,
  userLng,
  centerLat,
  centerLng,
  radiusMeters
) {
  const distance = calculateDistance(userLat, userLng, centerLat, centerLng);
  return distance <= radiusMeters;
}

/**
 * Validate latitude and longitude
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {boolean} True if valid coordinates
 */
function isValidCoordinates(lat, lng) {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

module.exports = {
  calculateDistance,
  isWithinGeofence,
  isValidCoordinates,
};
