import { logger } from "./logger";

interface GeoResult {
  lat: number;
  lng: number;
}

export async function geocodeAddress(address: string): Promise<GeoResult | null> {
  try {
    const encoded = encodeURIComponent(address);
    const url = `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "SaiTrips/1.0 (sai-trips@devotional.app)",
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      logger.warn({ address, status: response.status }, "Geocoding request failed");
      return null;
    }

    const data = await response.json() as Array<{ lat: string; lon: string }>;

    if (!data || data.length === 0) {
      logger.warn({ address }, "No geocoding results found");
      return null;
    }

    return {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
    };
  } catch (err) {
    logger.error({ err, address }, "Geocoding error");
    return null;
  }
}
