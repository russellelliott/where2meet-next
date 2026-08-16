import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';

/**
 * Get the reference to a user's POI subcollection (users/{userId}/poi)
 */
function poiCollection(userId) {
  return collection(db, 'users', userId, 'poi');
}

/**
 * Check if a temporary location is still active (not past its end date).
 * @param {{startDate?: string|null, endDate?: string|null}|null|undefined} tempLocation
 * @returns {boolean}
 */
export function isActiveTemporaryLocation(tempLocation) {
  if (!tempLocation || !tempLocation.endDate) return true;
  return new Date(tempLocation.endDate) >= new Date();
}

/**
 * Build a map of POI ID → friend associations from a user's friends list.
 * Returns unique POIs with all friend names and relationship types.
 * @param {Array<{id: string, name: string, location?: {homePoiId?: string, temporaryLocation?: {startDate?: string|null, endDate?: string|null, poiId?: string|null}}}>} friends
 * @returns {Map<string, Array<{friendId: string, friendName: string, type: string, startDate?: string, endDate?: string}]>}
 */
export function buildFriendPoiMap(friends) {
  const poiMap = new Map();

  if (!Array.isArray(friends)) return poiMap;

  for (const friend of friends) {
    if (!friend.location) continue;

    // Home POI
    if (friend.location.homePoiId) {
      if (!poiMap.has(friend.location.homePoiId)) {
        poiMap.set(friend.location.homePoiId, []);
       }
      poiMap.get(friend.location.homePoiId).push({
        friendId: friend.id,
        friendName: friend.name,
        type: 'home',
       });
      }

    // Temporary Location POI
    if (friend.location.temporaryLocation?.poiId) {
      const poiId = friend.location.temporaryLocation.poiId;
      if (!poiMap.has(poiId)) {
        poiMap.set(poiId, []);
       }
      poiMap.get(poiId).push({
        friendId: friend.id,
        friendName: friend.name,
        type: 'temporary',
        startDate: friend.location.temporaryLocation.startDate || null,
        endDate: friend.location.temporaryLocation.endDate || null,
       });
      }

    // Pickup POI
    if (friend.logistics?.pickupPoiId) {
      if (!poiMap.has(friend.logistics.pickupPoiId)) {
        poiMap.set(friend.logistics.pickupPoiId, []);
       }
      poiMap.get(friend.logistics.pickupPoiId).push({
        friendId: friend.id,
        friendName: friend.name,
        type: 'pickup',
       });
      }
    }

  return poiMap;
}

/**
 * Format a friend association label for display.
 * @param {{friendId: string, friendName: string, type: string, startDate?: string, endDate?: string}} assoc
 * @returns {string}
 */
export function formatFriendAssociationLabel(assoc) {
  if (assoc.type === 'home') {
    return `${assoc.friendName} (home)`;
   }
  if (assoc.type === 'pickup') {
    return `${assoc.friendName} (pickup)`;
   }
  if (assoc.type === 'temporary') {
    const start = assoc.startDate ? new Date(assoc.startDate).toLocaleDateString() : '';
    const end = assoc.endDate ? new Date(assoc.endDate).toLocaleDateString() : '';
    const dateStr = start && end ? ` (${start} - ${end})` : start ? ` (starts ${start})` : end ? ` (ends ${end})` : '';
    return `${assoc.friendName} (temporary${dateStr})`;
   }
  return assoc.friendName;
}

/**
 * Format all associations for a single POI into a combined label string.
 * E.g.: "Friend A (home, temporary (Jan 1 - Mar 31), pickup) | Friend B (home)"
 * Groups multiple types under the same friend name.
 * @param {Array<{friendId: string, friendName: string, type: string, startDate?: string, endDate?: string}>} associations
 * @returns {string}
 */
export function formatPoiFriendLabels(associations) {
  // Group by friendId
  const friendGroups = new Map();
  for (const assoc of associations) {
    if (!friendGroups.has(assoc.friendId)) {
      friendGroups.set(assoc.friendId, { name: assoc.friendName, types: [] });
     }
    friendGroups.get(assoc.friendId).types.push(assoc);
   }

  // Build labels
  const labels = [];
  for (const [, { name, types }] of friendGroups) {
    const typeLabels = types.map((t) => {
      if (t.type === 'home') return 'home';
      if (t.type === 'pickup') return 'pickup';
      if (t.type === 'temporary') {
        const start = t.startDate ? new Date(t.startDate).toLocaleDateString() : '';
        const end = t.endDate ? new Date(t.endDate).toLocaleDateString() : '';
        if (start && end) return `temporary (${start} - ${end})`;
        if (start) return `temporary (starts ${start})`;
        if (end) return `temporary (ends ${end})`;
        return 'temporary';
       }
      return t.type;
     });

    labels.push(`${name} (${typeLabels.join(', ')})`);
   }

  return labels.join(' | ');
}

/**
 * Get all POIs for a user (used to resolve friend homePoiId / tempLocation.poiId to city names)
 * @param {string} userId
 * @returns {Promise<Array<{id: string, [key: string]: any}>>}
 */
export async function getUserPoIs(userId) {
  if (!userId) throw new Error('userId is required');
  const snap = await getDocs(poiCollection(userId));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
* Get the reference to a friend subcollection
    * @param {string} userId
    * @returns {import('firebase/firestore').CollectionReference}
    */
function friendCollection(userId) {
  return collection(db, 'users', userId, 'friend');
}

/**
    * Get the reference to a specific friend document
    * @param {string} userId
    * @param {string} friendId
    * @returns {import('firebase/firestore').DocumentReference}
    */
function friendDocRef(userId, friendId) {
  return doc(db, 'users', userId, 'friend', friendId);
}

/**
    * Create or update a friend
    * @param {string} userId
    * @param {Partial<import('../components/FriendDashboard/types').Friend>} friendData
    * @returns {Promise<string>} The friend ID
    */
export async function saveFriend(userId, friendData) {
  if (!userId) throw new Error('userId is required');

  const col = friendCollection(userId);
  const ref = doc(col);
  const friendId = ref.id;

  const dataToSave = {
    ...friendData,
    id: friendId,
  };

  await setDoc(ref, dataToSave);
  return friendId;
}

/**
    * Update a friend partially
    * @param {string} userId
    * @param {string} friendId
    * @param {object} updates
    * @returns {Promise<void>}
    */
export async function updateFriend(userId, friendId, updates) {
  if (!userId || !friendId) throw new Error('userId and friendId are required');

  const ref = friendDocRef(userId, friendId);
  await updateDoc(ref, updates);
}

/**
    * Delete a friend
    * @param {string} userId
    * @param {string} friendId
    * @returns {Promise<void>}
    */
export async function deleteFriend(userId, friendId) {
  if (!userId || !friendId) throw new Error('userId and friendId are required');

  const ref = friendDocRef(userId, friendId);
  await deleteDoc(ref);
}

/**
    * Get all friends for a user
    * @param {string} userId
    * @returns {Promise<Array<{id: string, data: import('../components/FriendDashboard/types').Friend}>>}
    */
export async function getFriends(userId) {
  if (!userId) throw new Error('userId is required');

  const col = friendCollection(userId);
  const snapshot = await getDocs(col);
  return snapshot.docs.map((d) => ({
    id: d.id,
    data: d.data(),
  }));
}

/**
 * Convert a UTC ISO string (e.g. "2026-07-31T23:00:00.000Z") to a local date key "YYYY-MM-DD".
 * Uses the user's local timezone so the derived date matches what the calendar displays.
 */
function toLocalDateKey(utcString) {
  if (!utcString) return null;
  const d = new Date(utcString);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Normalize an input string to YYYY-MM-DD format.
 * - If already YYYY-MM-DD (length 10), use as-is.
 * - If full ISO string, derive local date key from it.
 */
function normalizeToDateKey(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  // Already a date-only string: YYYY-MM-DD
  if (dateStr.length === 10) return dateStr;
  // Full ISO string: derive local date
  return toLocalDateKey(dateStr);
}

/**
 * Set a friend's lastContactDate to the given date.
 * Always stores as YYYY-MM-DD for consistent, timezone-agnostic storage.
 * @param {string} userId 
 * @param {string} friendId
 * @param {string} dateStr ISO date-time string or date-only string (YYYY-MM-DD)
 * @returns {Promise<void>}
 */
 export async function setLastContactDate(userId, friendId, dateStr) {
   if (!userId || !friendId) throw new Error('userId and friendId are required');

   const ref = friendDocRef(userId, friendId);
   const dateKey = normalizeToDateKey(dateStr);

   await updateDoc(ref, {
      'contact.lastContactDate': dateKey,
    });
 }

/**
 * Record a contact immediately (derives local date and stores as YYYY-MM-DD).
 * @param {string} userId 
 * @param {string} friendId
 * @returns {Promise<void>}
 */
 export async function recordContactNow(userId, friendId) {
   const now = new Date().toISOString();
   return setLastContactDate(userId, friendId, toLocalDateKey(now));
 }

/**
    * Set a friend's home POI
    * @param {string} userId
    * @param {string} friendId
    * @param {string} poiId
    * @returns {Promise<void>}
    */
export async function setHomePoi(userId, friendId, poiId) {
  if (!userId || !friendId || !poiId) throw new Error('userId, friendId, and poiId are required');

  const ref = friendDocRef(userId, friendId);
  await updateDoc(ref, {
    'location.homePoiId': poiId,
  });
}

/**
    * Set a friend's temporary location
    * @param {string} userId
    * @param {string} friendId
    * @param {{startDate: string|null, endDate: string|null, poiId: string|null}} tempLocation
    * @returns {Promise<void>}
    */
export async function setTemporaryLocation(userId, friendId, tempLocation) {
  if (!userId || !friendId) throw new Error('userId and friendId are required');

  const ref = friendDocRef(userId, friendId);
  await updateDoc(ref, {
    'location.temporaryLocation': tempLocation,
  });
}

/**
    * Search friends by name (simple text search)
    * @param {string} userId
    * @param {string} searchTerm
    * @returns {Promise<Array<{id: string, data: import('../components/FriendDashboard/types').Friend}>>}
    */
export async function searchFriends(userId, searchTerm) {
  if (!userId || !searchTerm) throw new Error('userId and searchTerm are required');

  const col = friendCollection(userId);
  const snapshot = await getDocs(col);
  const lowerSearch = searchTerm.toLowerCase();
  return snapshot.docs
    .map((d) => ({ id: d.id, data: d.data() }))
    .filter((f) => {
      const nameMatch = f.data?.name?.toLowerCase().includes(lowerSearch);
      const tagMatch = f.data?.tags?.some((t) => t.toLowerCase().includes(lowerSearch));
      return nameMatch || tagMatch;
    });
}

/**
 * Record contact - updates lastContactDate to today (YYYY-MM-DD) and returns friend data
 * @param {string} userId 
 * @param {string} friendId
 * @returns {Promise<object>} Updated friend data
 */
 export async function recordContact(userId, friendId) {
   if (!userId || !friendId) throw new Error('userId and friendId are required');

   const ref = friendDocRef(userId, friendId);
     // Use local date key for consistent YYYY-MM-DD storage
   const today = toLocalDateKey(new Date().toISOString());

   await updateDoc(ref, {
       'contact.lastContactDate': today,
     });

   const snapshot = await getDoc(ref);
   return snapshot.exists() ? { id: snapshot.id, data: snapshot.data() } : null;
 }

/**
      * Add a POI ID to a friend's top-level placeIdeas
      * @param {string} userId
      * @param {string} friendId
      * @param {string} poiId
      * @returns {Promise<void>}
      */
export async function addPlaceIdea(userId, friendId, poiId) {
  if (!userId || !friendId || !poiId) throw new Error('userId, friendId, and poiId are required');

  const ref = friendDocRef(userId, friendId);
  await updateDoc(ref, {
     'planning.placeIdeas': arrayUnion(poiId),
    });
}

/**
      * Remove a POI ID from a friend's top-level placeIdeas
      * @param {string} userId
      * @param {string} friendId
      * @param {string} poiId
      * @returns {Promise<void>}
      */
export async function removePlaceIdea(userId, friendId, poiId) {
  if (!userId || !friendId || !poiId) throw new Error('userId, friendId, and poiId are required');

  const ref = friendDocRef(userId, friendId);
  await updateDoc(ref, {
     'planning.placeIdeas': arrayRemove(poiId),
    });
}

/**
      * Add a POI ID to a friend's top-level placeIdeas (top-level field)
      * @param {string} userId
      * @param {string} friendId
      * @param {string} poiId
      * @returns {Promise<void>}
      */
export async function addPlaceIdeaTopLevel(userId, friendId, poiId) {
  if (!userId || !friendId || !poiId) throw new Error('userId, friendId, and poiId are required');

  const ref = friendDocRef(userId, friendId);
  await updateDoc(ref, {
     placeIdeas: arrayUnion(poiId),
    });
}

/**
      * Remove a POI ID from a friend's top-level placeIdeas
      * @param {string} userId
      * @param {string} friendId
      * @param {string} poiId
      * @returns {Promise<void>}
      */
export async function removePlaceIdeaTopLevel(userId, friendId, poiId) {
  if (!userId || !friendId || !poiId) throw new Error('userId, friendId, and poiId are required');

  const ref = friendDocRef(userId, friendId);
  await updateDoc(ref, {
     placeIdeas: arrayRemove(poiId),
    });
}

/**
      * Toggle a POI ID in a friend's top-level placeIdeas
      * @param {string} userId
      * @param {string} friendId
      * @param {string} poiId
      * @returns {Promise<boolean>} true if added, false if removed
      */
export async function togglePlaceIdeaTopLevel(userId, friendId, poiId) {
  if (!userId || !friendId || !poiId) throw new Error('userId, friendId, and poiId are required');

  const ref = friendDocRef(userId, friendId);
  const snapshot = await getDoc(ref);

  if (!snapshot.exists()) return false;

  const data = snapshot.data();
  const currentIdeas = Array.isArray(data.placeIdeas) ? data.placeIdeas : [];

  if (currentIdeas.includes(poiId)) {
    await updateDoc(ref, { placeIdeas: arrayRemove(poiId) });
    return false;
  } else {
    await updateDoc(ref, { placeIdeas: arrayUnion(poiId) });
    return true;
  }
}
