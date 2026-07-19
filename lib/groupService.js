import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';

/**
  * Get the reference to a group subcollection
  * @param {string} userId
  * @returns {import('firebase/firestore').CollectionReference}
  */
function groupCollection(userId) {
  return collection(db, 'users', userId, 'group');
}

/**
  * Get the reference to a specific group document
  * @param {string} userId
  * @param {string} groupId
  * @returns {import('firebase/firestore').DocumentReference}
  */
function groupDocRef(userId, groupId) {
  return doc(db, 'users', userId, 'group', groupId);
}

/**
  * Create or update a group
  * @param {string} userId
  * @param {Partial<import('../components/FriendDashboard/types').Group>} groupData
  * @returns {Promise<string>} The group ID
  */
export async function saveGroup(userId, groupData) {
  if (!userId) throw new Error('userId is required');

  const col = groupCollection(userId);
  const ref = doc(col);
  const groupId = ref.id;

  const dataToSave = {
    ...groupData,
    id: groupId,
  };

  await setDoc(ref, dataToSave);
  return groupId;
}

/**
  * Alias for saveGroup - create a new group
  * @param {string} userId
  * @param {object} groupData
  * @returns {Promise<string>} The group ID
  */
export async function addGroup(userId, groupData) {
  return saveGroup(userId, groupData);
}

/**
  * Update a group partially
  * @param {string} userId
  * @param {string} groupId
  * @param {object} updates
  * @returns {Promise<void>}
  */
export async function updateGroup(userId, groupId, updates) {
  if (!userId || !groupId) throw new Error('userId and groupId are required');

  const ref = groupDocRef(userId, groupId);
  await updateDoc(ref, updates);
}

/**
  * Delete a group
  * @param {string} userId
  * @param {string} groupId
  * @returns {Promise<void>}
  */
export async function deleteGroup(userId, groupId) {
  if (!userId || !groupId) throw new Error('userId and groupId are required');

  const ref = groupDocRef(userId, groupId);
  await deleteDoc(ref);
}

/**
  * Get all groups for a user
  * @param {string} userId
  * @returns {Promise<Array<{id: string, data: import('../components/FriendDashboard/types').Group}>>}
  */
export async function getGroups(userId) {
  if (!userId) throw new Error('userId is required');

  const col = groupCollection(userId);
  const snapshot = await getDocs(col);
  
  return snapshot.docs.map((d) => ({
    id: d.id,
    data: d.data(),
   }));
}

/**
  * Get a single group by ID
  * @param {string} userId
  * @param {string} groupId
  * @returns {Promise<{id: string, data: import('../components/FriendDashboard/types').Group}>}
  */
export async function getGroup(userId, groupId) {
  if (!userId || !groupId) throw new Error('userId and groupId are required');

  const ref = groupDocRef(userId, groupId);
  const snapshot = await getDoc(ref);

  if (snapshot.exists()) {
    return { id: snapshot.id, data: snapshot.data() };
   }
  return null;
}

/**
  * Add a POI ID to a group's placeIdeas
  * @param {string} userId
  * @param {string} groupId
  * @param {string} poiId
  * @returns {Promise<void>}
  */
export async function addPlaceIdea(userId, groupId, poiId) {
  if (!userId || !groupId || !poiId) throw new Error('userId, groupId, and poiId are required');

  const ref = groupDocRef(userId, groupId);
  await updateDoc(ref, {
      'planning.placeIdeas': arrayUnion(poiId),
     });
}

/**
   * Remove a POI ID from a group's placeIdeas
   * @param {string} userId
   * @param {string} groupId
   * @param {string} poiId
   * @returns {Promise<void>}
   */
export async function removePlaceIdea(userId, groupId, poiId) {
  if (!userId || !groupId || !poiId) throw new Error('userId, groupId, and poiId are required');

  const ref = groupDocRef(userId, groupId);
  await updateDoc(ref, {
       'planning.placeIdeas': arrayRemove(poiId),
      });
}

/**
   * Toggle a POI ID in a group's top-level placeIdeas
   * @param {string} userId
   * @param {string} groupId
   * @param {string} poiId
   * @returns {Promise<boolean>} true if added, false if removed
   */
export async function togglePlaceIdeaTopLevel(userId, groupId, poiId) {
  if (!userId || !groupId || !poiId) throw new Error('userId, groupId, and poiId are required');

  const ref = groupDocRef(userId, groupId);
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

/**
  * Add a hangout ID to a group's planning.hangoutIds
  * @param {string} userId
  * @param {string} groupId
  * @param {string} hangoutId
  * @returns {Promise<void>}
  */
export async function addHangout(userId, groupId, hangoutId) {
  if (!userId || !groupId || !hangoutId) throw new Error('userId, groupId, and hangoutId are required');

  const ref = groupDocRef(userId, groupId);
  await updateDoc(ref, {
      'planning.hangoutIds': arrayUnion(hangoutId),
     });
}

/**
  * Remove a hangout ID from a group's planning.hangoutIds
  * @param {string} userId
  * @param {string} groupId
  * @param {string} hangoutId
  * @returns {Promise<void>}
  */
export async function removeHangout(userId, groupId, hangoutId) {
  if (!userId || !groupId || !hangoutId) throw new Error('userId, groupId, and hangoutId are required');

  const ref = groupDocRef(userId, groupId);
  await updateDoc(ref, {
      'planning.hangoutIds': arrayRemove(hangoutId),
     });
}

/**
  * Set all group members' lastContactDate to the given date string
  * @param {string} userId
  * @param {string} groupId
  * @param {string} dateStr ISO date-time string (or just date for "today")
  * @param {string[]} memberIds Array of member IDs to update
  * @returns {Promise<void>}
  */
export async function setGroupMembersLastContactDate(userId, groupId, dateStr, memberIds) {
  if (!userId || !groupId) throw new Error('userId and groupId are required');

  // Update each member's lastContactDate
  const promises = memberIds.map(async (friendId) => {
    const friendRef = doc(db, 'users', userId, 'friend', friendId);
    return updateDoc(friendRef, {
      'contact.lastContactDate': dateStr,
    });
  });

  await Promise.all(promises);
}

/**
  * Search groups by name
  * @param {string} userId
  * @param {string} searchTerm
  * @returns {Promise<Array<{id: string, data: import('../components/FriendDashboard/types').Group}>>}
  */
export async function searchGroups(userId, searchTerm) {
  if (!userId || !searchTerm) throw new Error('userId and searchTerm are required');

  const col = groupCollection(userId);
  const snapshot = await getDocs(col);

  const lowerSearch = searchTerm.toLowerCase();
  return snapshot.docs
     .map((d) => ({ id: d.id, data: d.data() }))
     .filter((g) => {
      return g.data?.name?.toLowerCase().includes(lowerSearch);
       });
}