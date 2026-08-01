import {
  collection,
  doc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  arrayRemove,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';

/**
 * Helper: Get all hangouts for a user and filter by a condition.
 * @param {string} userId
 * @param {(hangoutData: object) => boolean} predicate
 * @returns {Promise<import('firebase/firestore').DocumentReference[]>}
 */
async function getHangoutsMatching(userId, predicate) {
  const hangoutSnap = await getDocs(collection(db, 'users', userId, 'hangout'));
  return hangoutSnap.docs
    .filter(d => predicate(d.data()))
    .map(d => doc(db, 'users', userId, 'hangout', d.id));
}

/**
 * Delete a friend and remove their ID from:
 * - All hangouts' `friendIds[]` array
 * - All groups' `memberIds[]` array
 *
 * @param {string} userId - The owner's user ID
 * @param {string} friendId - The friend document ID to delete
 * @returns {Promise<void>}
 */
export async function deleteFriendWithCascades(userId, friendId) {
  if (!userId || !friendId) throw new Error('userId and friendId are required');

  const batch = writeBatch(db);

  // 1. Remove friendId from all hangouts' friendIds array
  const hangoutSnap = await getDocs(collection(db, 'users', userId, 'hangout'));
  hangoutSnap.docs.forEach((hangoutDoc) => {
    const data = hangoutDoc.data();
    if (Array.isArray(data.friendIds) && data.friendIds.includes(friendId)) {
      const ref = doc(db, 'users', userId, 'hangout', hangoutDoc.id);
      batch.update(ref, {
        friendIds: arrayRemove(friendId),
      });
    }
  });

  // 2. Remove friendId from all groups' memberIds array
  const groupSnap = await getDocs(collection(db, 'users', userId, 'group'));
  groupSnap.docs.forEach((groupDoc) => {
    const data = groupDoc.data();
    if (Array.isArray(data.memberIds) && data.memberIds.includes(friendId)) {
      const ref = doc(db, 'users', userId, 'group', groupDoc.id);
      batch.update(ref, {
        memberIds: arrayRemove(friendId),
      });
    }
  });

  // 3. Delete the friend document itself
  const friendRef = doc(db, 'users', userId, 'friend', friendId);
  batch.delete(friendRef);

  await batch.commit();
}

/**
 * Delete a POI and remove its ID from:
 * - All friends' top-level `placeIdeas[]` array
 * - All groups' top-level `placeIdeas[]` array
 * - All hangouts' `locationPoiId` or `poiId` field (set to null)
 * - Friend's `location.homePoiId` (set to empty string if matching)
 * - Friend's `location.temporaryLocation.poiId` (set to null if matching)
 *
 * @param {string} userId - The owner's user ID
 * @param {string} poiId - The POI document ID to delete
 * @returns {Promise<void>}
 */
export async function deletePoiWithCascades(userId, poiId) {
  if (!userId || !poiId) throw new Error('userId and poiId are required');

  const batch = writeBatch(db);

  // 1. Remove poiId from all friends' placeIdeas array
  const friendSnap = await getDocs(collection(db, 'users', userId, 'friend'));
  friendSnap.docs.forEach((friendDoc) => {
    const data = friendDoc.data();
    const friendRef = doc(db, 'users', userId, 'friend', friendDoc.id);

    // Remove from top-level placeIdeas
    if (Array.isArray(data.placeIdeas) && data.placeIdeas.includes(poiId)) {
      batch.update(friendRef, {
        placeIdeas: arrayRemove(poiId),
      });
    }

    // Remove from planning.placeIdeas (legacy)
    if (data.planning && Array.isArray(data.planning.placeIdeas) && data.planning.placeIdeas.includes(poiId)) {
      batch.update(friendRef, {
        'planning.placeIdeas': arrayRemove(poiId),
      });
    }

    // Clear homePoiId if it matches
    if (data.location?.homePoiId === poiId) {
      batch.update(friendRef, {
        'location.homePoiId': '',
      });
    }

    // Clear temporaryLocation.poiId if it matches
    if (data.location?.temporaryLocation?.poiId === poiId) {
      batch.update(friendRef, {
        'location.temporaryLocation.poiId': null,
      });
    }
  });

  // 2. Remove poiId from all groups' placeIdeas array
  const groupSnap = await getDocs(collection(db, 'users', userId, 'group'));
  groupSnap.docs.forEach((groupDoc) => {
    const data = groupDoc.data();
    const groupRef = doc(db, 'users', userId, 'group', groupDoc.id);

    // Remove from top-level placeIdeas
    if (Array.isArray(data.placeIdeas) && data.placeIdeas.includes(poiId)) {
      batch.update(groupRef, {
        placeIdeas: arrayRemove(poiId),
      });
    }

    // Remove from planning.placeIdeas (legacy)
    if (data.planning && Array.isArray(data.planning.placeIdeas) && data.planning.placeIdeas.includes(poiId)) {
      batch.update(groupRef, {
        'planning.placeIdeas': arrayRemove(poiId),
      });
    }
  });

  // 3. Clear locationPoiId/posId from all hangouts where it matches
  const hangoutSnap = await getDocs(collection(db, 'users', userId, 'hangout'));
  hangoutSnap.docs.forEach((hangoutDoc) => {
    const data = hangoutDoc.data();
    const hangoutRef = doc(db, 'users', userId, 'hangout', hangoutDoc.id);

    const shouldClear = (data.locationPoiId === poiId) || (data.poiId === poiId);
    if (shouldClear) {
      const updates = {};
      if (data.locationPoiId === poiId) {
        updates.locationPoiId = null;
      }
      if (data.poiId === poiId) {
        updates.poiId = null;
      }
      batch.update(hangoutRef, updates);
    }
  });

  // 4. Delete the POI document itself
  const poiRef = doc(db, 'users', userId, 'poi', poiId);
  batch.delete(poiRef);

  await batch.commit();
}

/**
 * Delete a map and remove its ID from:
 * - All POIs' `visibility.allowedMapIds[]` array
 * - If this results in empty allowedMapIds, set scope to 'all' and access to 'public'
 *
 * @param {string} userId - The owner's user ID (must match map.owner)
 * @param {string} mapId - The map document ID to delete
 * @returns {Promise<void>}
 */
export async function deleteMapWithCascades(userId, mapId) {
  if (!userId || !mapId) throw new Error('userId and mapId are required');

  const batch = writeBatch(db);

  // 1. Remove mapId from all POIs' allowedMapIds; set scope='all' if array becomes empty
  const poiSnap = await getDocs(collection(db, 'users', userId, 'poi'));
  poiSnap.docs.forEach((poiDoc) => {
    const data = poiDoc.data();
    const visibility = data.visibility || {};
    const allowedMapIds = Array.isArray(visibility.allowedMapIds) ? [...visibility.allowedMapIds] : [];

    if (!allowedMapIds.includes(mapId)) return;

    const newAllowedMapIds = allowedMapIds.filter(id => id !== mapId);
    const poiRef = doc(db, 'users', userId, 'poi', poiDoc.id);

    if (newAllowedMapIds.length === 0) {
      // Set scope to 'all' and access to 'public' when no maps remain
      batch.update(poiRef, {
        visibility: {
          access: 'public',
          scope: 'all',
          allowedMapIds: [],
        },
      });
    } else {
      batch.update(poiRef, {
        'visibility.allowedMapIds': newAllowedMapIds,
      });
    }
  });

  // 2. Delete the map document itself
  const mapRef = doc(db, 'maps', mapId);
  batch.delete(mapRef);

  await batch.commit();
}

/**
 * Delete a hangout and remove its ID from:
 * - All friends' `planning.hangoutIds[]` array
 * - All groups' `planning.hangoutIds[]` array
 *
 * @param {string} userId - The owner's user ID
 * @param {string} hangoutId - The hangout document ID to delete
 * @returns {Promise<void>}
 */
export async function deleteHangoutWithCascades(userId, hangoutId) {
  if (!userId || !hangoutId) throw new Error('userId and hangoutId are required');

  const batch = writeBatch(db);

  // 1. Remove hangoutId from all friends' planning.hangoutIds array
  const friendSnap = await getDocs(collection(db, 'users', userId, 'friend'));
  friendSnap.docs.forEach((friendDoc) => {
    const data = friendDoc.data();
    if (data.planning && Array.isArray(data.planning.hangoutIds) && data.planning.hangoutIds.includes(hangoutId)) {
      const ref = doc(db, 'users', userId, 'friend', friendDoc.id);
      batch.update(ref, {
        'planning.hangoutIds': arrayRemove(hangoutId),
      });
    }
  });

  // 2. Remove hangoutId from all groups' planning.hangoutIds array
  const groupSnap = await getDocs(collection(db, 'users', userId, 'group'));
  groupSnap.docs.forEach((groupDoc) => {
    const data = groupDoc.data();
    if (data.planning && Array.isArray(data.planning.hangoutIds) && data.planning.hangoutIds.includes(hangoutId)) {
      const ref = doc(db, 'users', userId, 'group', groupDoc.id);
      batch.update(ref, {
        'planning.hangoutIds': arrayRemove(hangoutId),
      });
    }
  });

  // 3. Delete the hangout document itself
  const hangoutRef = doc(db, 'users', userId, 'hangout', hangoutId);
  batch.delete(hangoutRef);

  await batch.commit();
}

/**
 * Delete a group and remove its ID from:
 * - All hangouts' `groupId` field (set to empty string/null)
 *
 * Also removes groupId from all friends' planning.hangoutIds? 
 * No — hangout references are kept; only the hangout's groupId is cleared.
 *
 * @param {string} userId - The owner's user ID
 * @param {string} groupId - The group document ID to delete
 * @returns {Promise<void>}
 */
export async function deleteGroupWithCascades(userId, groupId) {
  if (!userId || !groupId) throw new Error('userId and groupId are required');

  const batch = writeBatch(db);

  // 1. Clear groupId from all hangouts where it references this group
  const hangoutSnap = await getDocs(collection(db, 'users', userId, 'hangout'));
  hangoutSnap.docs.forEach((hangoutDoc) => {
    const data = hangoutDoc.data();
    if (data.groupId === groupId) {
      const ref = doc(db, 'users', userId, 'hangout', hangoutDoc.id);
      batch.update(ref, {
        groupId: null,
      });
    }
  });

  // 2. Delete the group document itself
  const groupRef = doc(db, 'users', userId, 'group', groupId);
  batch.delete(groupRef);

  await batch.commit();
}