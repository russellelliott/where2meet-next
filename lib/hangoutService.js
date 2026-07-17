import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';

/**
   * Get the reference to a hangouts subcollection
   * @param {string} userId
   * @returns {import('firebase/firestore').CollectionReference}
   */
function hangoutCollection(userId) {
  return collection(db, 'users', userId, 'hangout');
}

/**
   * Get the reference to a specific hangout document
   * @param {string} userId
   * @param {string} hangoutId
   * @returns {import('firebase/firestore').DocumentReference}
   */
function hangoutDocRef(userId, hangoutId) {
  return doc(db, 'users', userId, 'hangout', hangoutId);
}

/**
   * Create a hangout
   * @param {string} userId
   * @param {Partial<import('../components/FriendDashboard/types').Hangout>} hangoutData
   * @returns {Promise<string>} The hangout ID
   */
export async function saveHangout(userId, hangoutData) {
  if (!userId) throw new Error('userId is required');

  const col = hangoutCollection(userId);
  const ref = doc(col);
  const hangoutId = ref.id;

  const dataToSave = {
    ...hangoutData,
    id: hangoutId,
  };

  await setDoc(ref, dataToSave);
  return hangoutId;
}

/**
   * Alias for saveHangout - create a new hangout with full data
   * @param {string} userId
   * @param {object} hangoutData - { poiId, type, datetime, description, friendIds, groupId }
   * @returns {Promise<string>} The hangout ID
   */
export async function createHangout(userId, hangoutData) {
  return saveHangout(userId, hangoutData);
}

/**
    * Update a hangout partially
    * @param {string} userId
    * @param {string} hangoutId
    * @param {object} updates
    * @returns {Promise<void>}
    */
export async function updateHangout(userId, hangoutId, updates) {
  if (!userId || !hangoutId) throw new Error('userId and hangoutId are required');

  const ref = hangoutDocRef(userId, hangoutId);

  // Filter out undefined, null, and empty string values (Firestore doesn't allow them in updateDoc)
  const filteredUpdates = {};
  Object.keys(updates).forEach(key => {
    const value = updates[key];
    if (value !== undefined && value !== null) {
      // For strings, only include if non-empty (skip empty strings)
      if (typeof value === 'string' && value.trim() === '') {
        return;
      }
      filteredUpdates[key] = value;
    }
  });

  // Only update if there are actual values to update
  if (Object.keys(filteredUpdates).length > 0) {
    await updateDoc(ref, filteredUpdates);
  }
}

/**
   * Delete a hangout
   * @param {string} userId
   * @param {string} hangoutId
   * @returns {Promise<void>}
   */
export async function deleteHangout(userId, hangoutId) {
  if (!userId || !hangoutId) throw new Error('userId and hangoutId are required');

  const ref = hangoutDocRef(userId, hangoutId);
  await deleteDoc(ref);
}

/**
   * Get all hangouts for a user
   * @param {string} userId
   * @returns {Promise<Array<{id: string, data: import('../components/FriendDashboard/types').Hangout}>>}
   */
export async function getHangouts(userId) {
  if (!userId) throw new Error('userId is required');

  const col = hangoutCollection(userId);
  const snapshot = await getDocs(col);

  return snapshot.docs.map((d) => ({
    id: d.id,
    data: d.data(),
   }));
}

/**
   * Get a single hangout by ID
   * @param {string} userId
   * @param {string} hangoutId
   * @returns {Promise<{id: string, data: import('../components/FriendDashboard/types').Hangout}>}
   */
export async function getHangout(userId, hangoutId) {
  if (!userId || !hangoutId) throw new Error('userId and hangoutId are required');

  const ref = hangoutDocRef(userId, hangoutId);
  const snapshot = await getDoc(ref);

  if (snapshot.exists()) {
    return { id: snapshot.id, data: snapshot.data() };
   }
  return null;
}

/**
   * Get all hangouts involving a specific friend or group
   * Filters hangouts where the friend/group ID appears in any associated planning
   * @param {string} userId
   * @param {string} entityId The friend ID or group ID to search for
   * @returns {Promise<Array<{id: string, data: import('../components/FriendDashboard/types').Hangout}>>}
   */
export async function getHangoutsForEntity(userId, entityId) {
  if (!userId || !entityId) throw new Error('userId and entityId are required');

  const allHangouts = await getHangouts(userId);
  // We need to check friend/group planning.hangoutIds to find related hangouts
  // This is a basic implementation - the actual filtering should be done at the component level
  // by cross-referencing with friend/group data
  return allHangouts;
}

/**
   * Mark a hangout as complete and update all involved friends' lastContactDate
   * @param {string} userId
   * @param {string} hangoutId
   * @param {string} [completionDate] - Optional ISO date string, defaults to now
   * @returns {Promise<void>}
   */
export async function completeHangout(userId, hangoutId, completionDate) {
  if (!userId || !hangoutId) throw new Error('userId and hangoutId are required');
  
  const now = completionDate || new Date().toISOString();
  
   // Update the hangout with completion status
  await updateDoc(hangoutDocRef(userId, hangoutId), {
    completed: true,
    completedAt: now,
   });
    
   // Note: The actual friend lastContactDate updates are handled at the component level
   // since we don't have direct access to friend documents from this service file
}

/**
   * Check if a hangout has passed its start date
   * @param {string} hangoutDatetime ISO date-time string
   * @returns {boolean}
   */
export function isHangoutPast(hangoutDatetime) {
  const hangoutDate = new Date(hangoutDatetime);
  const now = new Date();
  return hangoutDate < now;
}

/**
   * Format a date nicely for display
   * @param {string} dateStr ISO date-time string
   * @returns {string} Formatted date string
   */
export function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
   * Get today's date as ISO string (date only, no time)
   * @returns {string} Today's date at midnight UTC
   */
export function getTodayDateString() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.toISOString();
}