import { collection, doc, setDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

function normalizeVisibility(visibility = {}) {
  return {
    access: visibility.access || 'private',
    scope: visibility.scope || 'selective',
    allowedMapIds: Array.isArray(visibility.allowedMapIds)
      ? visibility.allowedMapIds
      : [],
  };
}

async function savePoi(userId, poi) {
  if (!userId) throw new Error('userId is required');

  const poiRef = doc(collection(db, 'users', userId, 'poi'));
  const finalPoi = { ...poi, id: poiRef.id };

  await setDoc(poiRef, finalPoi);
  return finalPoi;
}

function reverseGeocode(lat, lng) {
  const geocoder = new window.google.maps.Geocoder();

  return new Promise((resolve, reject) => {
    geocoder.geocode({ location: { lat, lng } }, (results, status) => {
      if (status === 'OK' && results?.[0]) {
        resolve(results[0]);
      } else {
        reject(new Error(status || 'REVERSE_GEOCODE_FAILED'));
      }
    });
  });
}

export async function createPoiFromPlaceResult({
  userId,
  place,
  link = null,
  date = null,
  visibility = {},
}) {
  if (!place?.geometry?.location) {
    throw new Error('place with geometry is required');
  }

  const lat =
    typeof place.geometry.location.lat === 'function'
      ? place.geometry.location.lat()
      : place.geometry.location.lat;

  const lng =
    typeof place.geometry.location.lng === 'function'
      ? place.geometry.location.lng()
      : place.geometry.location.lng;

  return savePoi(userId, {
    name: place.name || place.formatted_address?.split(',')[0] || 'Unknown Location',
    location: {
      lat,
      lng,
      address: place.formatted_address || '',
      googlePlaceId: place.place_id || null,
    },
    link,
    date,
    visibility: normalizeVisibility(visibility),
  });
}

export async function createPoiFromCoordinates({
  userId,
  lat,
  lng,
  link = null,
  date = null,
  visibility = {},
}) {
  const parsedLat = Number(lat);
  const parsedLng = Number(lng);

  if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) {
    throw new Error('valid lat/lng are required');
  }

  const result = await reverseGeocode(parsedLat, parsedLng);

  const streetNumber = result.address_components?.find(
    c => c.types.includes('street_number')
  )?.long_name;

  const route = result.address_components?.find(
    c => c.types.includes('route')
  )?.long_name;

  const establishment = result.address_components?.find(
    c => c.types.includes('establishment') || c.types.includes('point_of_interest')
  )?.long_name;

  const name =
    establishment ||
    (streetNumber && route ? `${streetNumber} ${route}` : null) ||
    route ||
    result.address_components?.[0]?.long_name ||
    result.formatted_address?.split(',')[0] ||
    'Unknown Location';

  return savePoi(userId, {
    name,
    location: {
      lat: parsedLat,
      lng: parsedLng,
      address: result.formatted_address || `${parsedLat}, ${parsedLng}`,
      googlePlaceId: result.place_id || null,
    },
    link,
    date,
    visibility: normalizeVisibility(visibility),
  });
}