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
* Get all POIs for a user (used to resolve friend homePoiId / tempLocation.poiId to city names)
* @param {string} userId
* @returns {Promise<Array>}
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
    * Add a POI ID to a friend's placeIdeas
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
    * Remove a POI ID from a friend's placeIdeas
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
    * Add a hangout ID to a friend's planning.hangoutIds
    * @param {string} userId
    * @param {string} friendId
    * @param {string} hangoutId
    * @returns {Promise<void>}
    */
export async function addHangout(userId, friendId, hangoutId) {
  if (!userId || !friendId || !hangoutId) throw new Error('userId, friendId, and hangoutId are required');

  const ref = friendDocRef(userId, friendId);
  await updateDoc(ref, {
    'planning.hangoutIds': arrayUnion(hangoutId),
  });
}

/**
    * Remove a hangout ID from a friend's planning.hangoutIds
    * @param {string} userId
    * @param {string} friendId
    * @param {string} hangoutId
    * @returns {Promise<void>}
    */
export async function removeHangout(userId, friendId, hangoutId) {
  if (!userId || !friendId || !hangoutId) throw new Error('userId, friendId, and hangoutId are required');

  const ref = friendDocRef(userId, friendId);
  await updateDoc(ref, {
    'planning.hangoutIds': arrayRemove(hangoutId),
  });
}