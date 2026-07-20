import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  Divider,
  CircularProgress,
  Alert,
  Snackbar,
  Grid,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import { auth } from '../../firebaseConfig';
import FriendList from './FriendList';
import HangoutScheduler from './HangoutScheduler';
import StatsGrid from './StatsGrid';
import PoiIdeasDialog from './PoiIdeasDialog';
import PoiIdeasPicker from './PoiIdeasPicker';
import CreateHangoutDialog from './CreateHangoutDialog';
import HangoutList from './HangoutList';
import { getFriends as getFriendsService, getUserPoIs, recordContact as recordContactApi, setLastContactDate as setLastContactDateApi, deleteFriend, updateFriend, togglePlaceIdeaTopLevel as toggleFriendPlaceIdeaTopLevel } from '../../lib/friendService';
import { getGroups, addGroup as addGroupApi, updateGroup, deleteGroup, togglePlaceIdeaTopLevel as toggleGroupPlaceIdeaTopLevel } from '../../lib/groupService';
import { getHangouts, createHangout as createHangoutApi, completeHangout, deleteHangout as deleteHangoutApi, updateHangout as updateHangoutApi } from '../../lib/hangoutService';
import FriendForm from './FriendForm';
import { MapPin } from 'lucide-react';

/**
 * Helper: check if error indicates auth/session issue that needs re-login
 */
function isAuthError(error) {
  if (!error) return false;
  const msg = error.message || '';
  return (
    msg.includes('not authenticated') ||
    msg.includes('unauthenticated') ||
    msg.includes('user-token-expired')
    );
}

/**
 * FriendsDashboard - Main dashboard component for managing friends, groups, and hangouts
 */
export default function FriendsDashboard({ onSignOut }) {
  const [user, setUser] = useState(auth.currentUser);

   // Planning / editing state
  const [editingFriend, setEditingFriend] = useState(null);
  const [editingGroup, setEditingGroup] = useState(null);

   // Data state
  const [friends, setFriends] = useState([]);
  const [groups, setGroups] = useState([]);
  const [hangouts, setHangouts] = useState([]);
  const [plannedHangouts, setPlannedHangouts] = useState([]);
  const [history, setHistory] = useState([]);
  const [selectedFriendId, setSelectedFriendId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [error, setError] = useState(null);
  const [authError, setAuthError] = useState(null);

   // POI-related state
  const [poiIdeasOpen, setPoiIdeasOpen] = useState(false);
  const [selectedPoiId, setSelectedPoiId] = useState(null);
  const [createHangoutOpen, setCreateHangoutOpen] = useState(false);
  const [selectedHangoutPoiId, setSelectedHangoutPoiId] = useState(null);
  const [selectedHangoutPoiName, setSelectedHangoutPoiName] = useState(null);
  const [pois, setPoIs] = useState([]);
  const [cityCache, setCityCache] = useState({});

   // Hangout editing state
  const [editingHangout, setEditingHangout] = useState(null);
  const [isEditingHangoutMode, setIsEditingHangoutMode] = useState(false);

  // Delete confirmation dialog state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetFriend, setDeleteTargetFriend] = useState(null);

   // Shared PoiIdeasPicker state (used on maps + friend dashboard)
  const [pickerEntityType, setPickerEntityType] = useState('friend'); // 'friend' or 'group'
  const [pickerEntityId, setPickerEntityId] = useState(null);

   // Toggle add friend form visibility - must be defined after showAddForm state
  const handleToggleAddForm = useCallback(() => {
    setShowAddForm((prev) => {
      const newVal = !prev;
      if (!newVal) {
          // Closing the form - clear editing state
        setEditingFriend(null);
        }
      return newVal;
      });
    }, []);

    // Load data for a given user
  const loadData = useCallback(async (currentUser) => {
    if (!currentUser) {
      setLoading(false);
      setFriends([]);
      setGroups([]);
      setHangouts([]);
      setPlannedHangouts([]);
      setHistory([]);
      return;
      }

    setLoading(true);
    setError(null);
    setAuthError(null);

    try {
      const [friendsData, groupsData, hangoutsData, poisData] = await Promise.all([
        getFriendsService(currentUser.uid),
        getGroups(currentUser.uid),
        getHangouts(currentUser.uid),
        getUserPoIs(currentUser.uid),
        ]);

         // Flatten friend data and ensure top-level placeIdeas exists for migration
       const flattenedFriends = (friendsData || []).map(f => ({
             ...f.data,
         id: f.id,
             // Migrate from planning.placeIdeas to top-level if needed
         placeIdeas: Array.isArray(f.data.placeIdeas)
             ? f.data.placeIdeas
             : (f.data.planning && Array.isArray(f.data.planning.placeIdeas) ? f.data.planning.placeIdeas : []),
            }));
       setFriends(flattenedFriends);

         // Flatten group data and ensure planning object exists per schema
       // Ensure top-level placeIdeas field exists for migration
       const flattenedGroups = (groupsData || []).map(g => ({
             ...g.data,
         id: g.id,
         planning: g.data.planning || { notes: '' },
             // Migrate from planning.placeIdeas to top-level if needed
         placeIdeas: Array.isArray(g.data.placeIdeas)
             ? g.data.placeIdeas
             : (g.data.planning && Array.isArray(g.data.planning.placeIdeas) ? g.data.planning.placeIdeas : []),
            }));
       setGroups(flattenedGroups);

         // Flatten POI data for direct access in components
       const flattenedPoIs = (poisData || []).map(p => ({ ...p, id: p.id }));
       setPoIs(flattenedPoIs);

         // All hangouts (from friend planning + group planning + standalone)
       const allHangoutIds = new Set();
         (friendsData || []).forEach((f) => {
           (f.data?.planning?.hangoutIds || []).forEach((id) => allHangoutIds.add(id));
         });
         (groupsData || []).forEach((g) => {
           (g.data?.planning?.hangoutIds || []).forEach((id) => allHangoutIds.add(id));
         });

         // Flatten hangout data for direct access in components
       const flattenedHangouts = (hangoutsData || []).map(h => ({ ...h.data, id: h.id }));
       setHangouts(flattenedHangouts);

         // Helper to safely convert Firestore Timestamp or ISO string to Date
        function toTimestamp(val) {
          if (!val) return null;
           // Handle Firestore Timestamp objects (from SDK v9 snapshot.data())
          if (val?.toDate && typeof val.toDate === 'function') {
            return val.toDate();
           }
           // Handle native Date or string
          return new Date(val);
          }

         // Separate planned vs completed using flattened data
        const now = new Date();
       const planned = flattenedHangouts.filter((h) => {
         const dt = toTimestamp(h.datetime);
         return dt && dt >= now;
         });
       const completed = flattenedHangouts.filter((h) => {
         const dt = toTimestamp(h.datetime);
         return dt && dt < now;
         });

       setPlannedHangouts(planned);
       setHistory(completed);
       } catch (err) {
      console.error('Error loading dashboard data:', err);

      if (isAuthError(err)) {
        setAuthError('Your session may have expired. Please sign in again.');
        } else {
        setError('Failed to load dashboard data. Please check your connection.');
        }
      } finally {
      setLoading(false);
      }
    }, []);

  // Helper: resolve friend's home location display text from POI data
  function resolveFriendHomeLocation(friend, poisList) {
    if (!friend?.location?.homePoiId) return 'No home location set';
    const poi = poisList?.find((p) => p.id === friend.location.homePoiId);
    if (poi) {
      if (poi.location?.address) return poi.location.address;
      if (poi.location?.lat && poi.location?.lng) return `${poi.location.lat.toFixed(4)}, ${poi.location.lng.toFixed(4)}`;
    }
    return 'Home set';
  }

  // Open delete confirmation dialog for a friend
  const handleOpenDeleteConfirm = useCallback((friendId) => {
    const friend = friends.find((f) => f.id === friendId);
    if (friend) {
      setDeleteTargetFriend(friend);
      setDeleteConfirmOpen(true);
    }
  }, [friends]);

  // Handle delete confirmation
  const handleConfirmDeleteFriend = useCallback(async () => {
    if (!deleteTargetFriend) return;
    
    try {
      await deleteFriend(user.uid, deleteTargetFriend.id);
      await loadData(user);
      if (selectedFriendId === deleteTargetFriend.id) setSelectedFriendId(null);
    } catch (err) {
      console.error('Error deleting friend:', err);
      if (isAuthError(err)) {
        setAuthError('Session expired. Please sign in again.');
      } else {
        setError('Failed to delete friend.');
      }
    } finally {
      setDeleteConfirmOpen(false);
      setDeleteTargetFriend(null);
    }
  }, [deleteTargetFriend, user, loadData, selectedFriendId]);

  const handleCloseDeleteConfirm = useCallback(() => {
    setDeleteConfirmOpen(false);
    setDeleteTargetFriend(null);
  }, []);

  // Resolve coordinates to a city name using Google reverse geocoding.
  function resolveCity(lat, lng) {
    return new Promise((resolve) => {
      try {
        if (typeof window.google !== 'undefined' && window.google.maps?.Geocoder) {
          const geocoder = new window.google.maps.Geocoder();
          geocoder.geocode({ location: { lat, lng } }, (results, status) => {
            if (status === 'OK' && results?.length) {
              const result = results[0];
              let city = result.address_components.find((c) => c.types.includes('locality'))?.long_name;
              if (!city) city = result.address_components.find((c) => c.types.includes('postal_town'))?.long_name;
              if (!city) city = result.address_components.find((c) => c.types.includes('administrative_area_level_3'))?.long_name;
              if (!city) city = result.address_components.find((c) => c.types.includes('sublocality'))?.long_name;
              return resolve(city || null);
              }
            resolve(null);
            });
          } else {
          resolve(null);
          }
        } catch (err) {
        console.warn('Reverse geocoding failed', err);
        resolve(null);
        }
      });
    }

   // Subscribe to Firebase Auth SDK directly
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((loggedInUser) => {
      setUser(loggedInUser);
      });
    return () => unsubscribe();
    }, []);

   // Load data whenever the authenticated user changes
  useEffect(() => {
    if (user) {
      loadData(user);
      } else {
      setFriends([]);
      setGroups([]);
      setHangouts([]);
      setPlannedHangouts([]);
      setHistory([]);
      setLoading(false);
      }
    }, [user]);

  const handleRecordContact = useCallback(async (friendId) => {
    if (!user || !friendId) return;

    try {
      await recordContactApi(user.uid, friendId);
      await loadData(user);
       } catch (err) {
      console.error('Error recording contact:', err);
      if (isAuthError(err)) {
        setAuthError('Session expired. Please sign in again.');
         } else {
        setError('Failed to record contact.');
         }
       }
     }, [user, loadData, friends]);

  const handleSetLastContactDate = useCallback(async (friendId, dateStr) => {
    if (!user || !friendId || !dateStr) return;

    try {
         // Store as plain YYYY-MM-DD for consistent timezone-agnostic storage
      await setLastContactDateApi(user.uid, friendId, dateStr);
      await loadData(user);
       } catch (err) {
      console.error('Error setting last contact date:', err);
      if (isAuthError(err)) {
        setAuthError('Session expired. Please sign in again.');
         } else {
        setError('Failed to set last contact date.');
         }
       }
      }, [user, loadData]);

  const handleDeleteFriend = useCallback(async (friendId) => {
    // This is kept as fallback for direct calls from FriendList
    // The primary flow now goes through handleOpenDeleteConfirm
    if (!user || !friendId) return;

    try {
      await deleteFriend(user.uid, friendId);
      await loadData(user);
      if (selectedFriendId === friendId) setSelectedFriendId(null);
       } catch (err) {
      console.error('Error deleting friend:', err);
      if (isAuthError(err)) {
        setAuthError('Session expired. Please sign in again.');
        } else {
        setError('Failed to delete friend.');
        }
       }
     }, [user, loadData, selectedFriendId, friends]);

  const handleEditFriend = useCallback((friend) => {
    setEditingFriend(friend);
    setShowAddForm(true);
    setEditingGroup(null);
    }, []);

  const handleAddGroup = useCallback(async (groupData, groupId) => {
    if (!user) return;

    try {
      if (groupId) {
          // Update existing group
        await updateGroup(user.uid, groupId, groupData);
        } else {
          // Create new group
        await addGroupApi(user.uid, groupData);
        }
      await loadData(user);
      setEditingGroup(null);
      } catch (err) {
      console.error('Error saving group:', err);
      if (isAuthError(err)) {
        setAuthError('Session expired. Please sign in again.');
        } else {
        setError('Failed to save group.');
        }
      }
    }, [user, loadData]);

  const handleEditGroup = useCallback((group) => {
    setEditingGroup(group);
    setEditingFriend(null);
    setShowAddForm(false);
    }, []);

  const handleDeleteGroup = useCallback(async (groupId) => {
    if (!confirm('Are you sure you want to delete this group?')) return;
    if (!user || !groupId) return;

    try {
      await deleteGroup(user.uid, groupId);
      await loadData(user);
      } catch (err) {
      console.error('Error deleting group:', err);
      if (isAuthError(err)) {
        setAuthError('Session expired. Please sign in again.');
        } else {
        setError('Failed to delete group.');
        }
      }
    }, [user, loadData]);

  const handleDeletePlannedHangout = useCallback(async (hangoutId) => {
    if (!confirm('Are you sure you want to cancel this hangout?')) return;
    if (!user || !hangoutId) return;

    try {
      await deleteHangoutApi(user.uid, hangoutId);
      setHangouts((prev) => prev.filter((h) => h.id !== hangoutId));
      setPlannedHangouts((prev) => prev.filter((h) => h.id !== hangoutId));
      setHistory((prev) => prev.filter((h) => h.id !== hangoutId));
        } catch (err) {
      console.error('Error deleting hangout:', err);
      if (isAuthError(err)) {
        setAuthError('Session expired. Please sign in again.');
          } else {
        setError('Failed to cancel hangout.');
          }
        }
      }, [user]);

     // Delete hangout from the hangout list (full delete from Firestore)
  const handleDeleteHangout = useCallback(async (hangoutId) => {
    if (!confirm('Are you sure you want to delete this hangout? This action cannot be undone.')) return;
    if (!user || !hangoutId) return;

    try {
      await deleteHangoutApi(user.uid, hangoutId);
      setHangouts((prev) => prev.filter((h) => h.id !== hangoutId));
         // Also remove from planned/history views
      setPlannedHangouts((prev) => prev.filter((h) => h.id !== hangoutId));
      setHistory((prev) => prev.filter((h) => h.id !== hangoutId));
      await loadData(user);
       } catch (err) {
      console.error('Error deleting hangout:', err);
      if (isAuthError(err)) {
        setAuthError('Session expired. Please sign in again.');
         } else {
        setError('Failed to delete hangout.');
         }
       }
     }, [user, loadData]);

      // Edit hangout - open the scheduler in edit mode (from HangoutList or HangoutScheduler)
  const handleEditHangout = useCallback((hangout) => {
    setEditingHangout(hangout);
    setIsEditingHangoutMode(true);
       }, []);

       // Edit planned/upcoming hangout from HangoutScheduler — pre-populates the scheduler dialog
  const handleEditPlannedHangout = useCallback((hangout) => {
     setEditingHangout({
       ...hangout,
       friendIds: hangout.friendIds || [],
       groupId: hangout.groupId || '',
       poiId: hangout.poiId || hangout.locationPoiId || null,
       description: hangout.description || hangout.details || '',
     });
    setIsEditingHangoutMode(true);
      }, []);

   // Plan Event: clear edit state and open create form
  const handlePlanEvent = useCallback(() => {
    setEditingHangout(null);
    setIsEditingHangoutMode(false);
    }, []);

     // Handle hangout save (create or update)
  const handleSaveHangout = useCallback(async (hangoutData) => {
    if (!user) return;

    try {
      if (isEditingHangoutMode && editingHangout) {
           // Update existing hangout
        await updateHangoutApi(user.uid, editingHangout.id, hangoutData);
         } else {
           // Create new hangout
        await createHangoutApi(user.uid, hangoutData);
         }

      setIsEditingHangoutMode(false);
      setEditingHangout(null);
      await loadData(user);
       } catch (err) {
      console.error('Error saving hangout:', err);
      if (isAuthError(err)) {
        setAuthError('Session expired. Please sign in again.');
         } else {
        setError('Failed to save hangout.');
         }
       }
     }, [user, isEditingHangoutMode, editingHangout, loadData]);

   /**
    * Convert a UTC ISO datetime string (e.g. "2026-07-31T18:00:00.000Z") to local YYYY-MM-DD.
    * Uses the user's local timezone getters so the derived date matches what the calendar displays.
    */
  function utcToLastContactDate(utcIso) {
    if (!utcIso) return null;
    const d = new Date(utcIso);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
   }

  const handleCompletePlannedHangout = useCallback(async (hangoutId, actualDate, attendeeIds) => {
    if (!user || !hangoutId) return;

    try {
       // Derive local date key from the hangout's UTC datetime so lastContactDate matches
       // what the calendar displays (e.g. July 31 6pm UTC -> "2026-07-31" for PST user)
      const localDateKey = utcToLastContactDate(actualDate);

         // Update lastContactDate for all attendees (friends collection)
      for (const friendId of attendeeIds) {
        const friend = friends.find((f) => f.id === friendId);
        if (friend) {
          await updateFriend(user.uid, friendId, {
            contact: {
                 ...friend.contact,
              lastContactDate: localDateKey,
               },
             });
           }
         }

         // Move hangout from planned to history
      setPlannedHangouts((prev) => prev.filter((h) => h.id !== hangoutId));

      await loadData(user);
       } catch (err) {
      console.error('Error completing hangout:', err);
      if (isAuthError(err)) {
        setAuthError('Session expired. Please sign in again.');
         } else {
        setError('Failed to complete hangout.');
         }
       }
     }, [user, friends, loadData]);

  const handleTogglePlaceIdea = useCallback(async (friendId, groupId, poiId) => {
    // Legacy handler for backward compatibility with planning.placeIdeas
    if (!user || !poiId) return;

    try {
      if (friendId) {
        const friend = friends.find((f) => f.id === friendId);
        if (friend) {
          const currentIdeas = (friend.planning && Array.isArray(friend.planning.placeIdeas))
                ? [...friend.planning.placeIdeas]
                : [];
          const newIdeas = currentIdeas.includes(poiId)
                ? currentIdeas.filter((id) => id !== poiId)
                : [...currentIdeas, poiId];

          await updateFriend(user.uid, friendId, {
            planning: {
                  ...(friend.planning || {}),
              placeIdeas: newIdeas,
                },
              });
            }
          } else if (groupId) {
        const group = groups.find((g) => g.id === groupId);
        if (group) {
          const currentIdeas = (group.planning && Array.isArray(group.planning.placeIdeas))
                ? [...group.planning.placeIdeas]
                : [];
          const newIdeas = currentIdeas.includes(poiId)
                ? currentIdeas.filter((id) => id !== poiId)
                : [...currentIdeas, poiId];

          await updateGroup(user.uid, groupId, {
            planning: {
                  ...(group.planning || {}),
              placeIdeas: newIdeas,
                },
              });
            }
          }

          await loadData(user);
        } catch (err) {
      console.error('Error toggling place idea:', err);
      if (isAuthError(err)) {
        setAuthError('Session expired. Please sign in again.');
        } else {
        setError('Failed to update place idea.');
        }
        }
       }, [user, friends, groups, loadData]);

     // Shared placeIdeas picker handler — uses top-level placeIdeas field
    const handleTogglePickerPlaceIdea = useCallback(async (err2, entityType, entityId, poiId) => {
       if (err2) {
        console.error('Error in toggle place idea:', err2);
        if (isAuthError(err2)) {
          setAuthError('Session expired. Please sign in again.');
           } else {
          setError('Failed to update place idea.');
           }
         return;
        }
       if (!user || !entityId || !poiId) return;

       try {
         if (entityType === 'friend') {
          await toggleFriendPlaceIdeaTopLevel(user.uid, entityId, poiId);
           } else if (entityType === 'group') {
          await toggleGroupPlaceIdeaTopLevel(user.uid, entityId, poiId);
           }
         await loadData(user);
          } catch (toggleErr) {
        console.error('Error toggling place idea (picker):', toggleErr);
        if (isAuthError(toggleErr)) {
          setAuthError('Session expired. Please sign in again.');
           } else {
          setError('Failed to update place idea.');
           }
           }
         }, [user, loadData]);

      // Open shared picker for a friend's placeIdeas from FriendList
   const openFriendPlaceIdeasPicker = useCallback((friendId) => {
    setPickerEntityType('friend');
    setPickerEntityId(friendId || selectedFriendId);
    setPoiIdeasOpen(true);
       }, [selectedFriendId]);

     // Open shared picker for selected group's placeIdeas
   const openGroupPlaceIdeasPicker = useCallback((groupId) => {
    setPickerEntityType('group');
    setPickerEntityId(groupId);
    setPoiIdeasOpen(true);
      }, []);

  const handleCreateHangout = useCallback(async (hangoutData) => {
    if (!user) return;

    try {
      const newHangout = await createHangoutApi(user.uid, hangoutData);

         // Add hangout to selected friends and/or group
      if (hangoutData.friendIds && hangoutData.friendIds.length > 0) {
        for (const friendId of hangoutData.friendIds) {
          const friend = friends.find((f) => f.id === friendId);
          if (friend) {
            const newHangoutIds = [...(friend.planning?.hangoutIds || []), newHangout];
            await updateFriend(user.uid, friendId, {
              planning: {
                  ...friend.planning,
                hangoutIds: newHangoutIds,
                },
              });
            }
          }
         } else if (hangoutData.groupId) {
        const group = groups.find((g) => g.id === hangoutData.groupId);
        if (group) {
          const newHangoutIds = [...(group.planning?.hangoutIds || []), newHangout];
          await updateGroup(user.uid, hangoutData.groupId, {
            planning: {
                ...group.planning,
              hangoutIds: newHangoutIds,
              },
            });
          }
        }

      setCreateHangoutOpen(false);
      setSelectedHangoutPoiId(null);
      setSelectedHangoutPoiName(null);
      await loadData(user);
       } catch (err) {
      console.error('Error creating hangout:', err);
      if (isAuthError(err)) {
        setAuthError('Session expired. Please sign in again.');
        } else {
        setError('Failed to create hangout.');
        }
       }
      }, [user, friends, groups, loadData]);

     // Legacy handler for completing individual hangouts from HangoutList (non-scheduled)
     // Stores lastContactDate as YYYY-MM-DD using local timezone
   const handleCompleteHangout = useCallback(async (hangoutId) => {
    if (!confirm('Mark this hangout as complete? This will update all friends\' lastContactDate.')) return;
    if (!user || !hangoutId) return;

    try {
      await completeHangout(user.uid, hangoutId);

         // Derive local date key from current moment for consistent YYYY-MM-DD storage
      const todayLocal = utcToLastContactDate(new Date().toISOString());

         // Update friend records with local date key
      for (const friend of friends) {
        if ((friend.planning?.hangoutIds || []).includes(hangoutId)) {
          await updateFriend(user.uid, friend.id, {
            contact: {
                 ...friend.contact,
              lastContactDate: todayLocal,
               },
             });
           }
         }

      await loadData(user);
       } catch (err) {
      console.error('Error completing hangout:', err);
      if (isAuthError(err)) {
        setAuthError('Session expired. Please sign in again.');
         } else {
        setError('Failed to complete hangout.');
         }
       }
     }, [user, friends, loadData]);

     // Add planned hangout from HangoutScheduler - saves to Firestore + updates friend/group planning
  const handleAddPlannedHangout = useCallback(async (hangoutData) => {
    if (!user) return;

    try {
      const newHangoutId = await createHangoutApi(user.uid, hangoutData);

         // Add hangout to selected friends and/or group's planning.hangoutIds
      if (hangoutData.friendIds && hangoutData.friendIds.length > 0) {
        for (const friendId of hangoutData.friendIds) {
          const friend = friends.find((f) => f.id === friendId);
          if (friend) {
            const newHangoutIds = [...(friend.planning?.hangoutIds || []), newHangoutId];
            await updateFriend(user.uid, friendId, {
              planning: {
                  ...friend.planning,
                hangoutIds: newHangoutIds,
                },
              });
            }
          }
         } else if (hangoutData.groupId) {
        const group = groups.find((g) => g.id === hangoutData.groupId);
        if (group) {
          const newHangoutIds = [...(group.planning?.hangoutIds || []), newHangoutId];
          await updateGroup(user.uid, hangoutData.groupId, {
            planning: {
                ...group.planning,
              hangoutIds: newHangoutIds,
              },
            });
          }
        }

         // Reset editing states since we just created a hangout
      setEditingGroup(null);

      await loadData(user);
      } catch (err) {
      console.error('Error adding hangout:', err);
      if (isAuthError(err)) {
        setAuthError('Session expired. Please sign in again.');
        } else {
        setError('Failed to create hangout.');
        }
      }
    }, [user, loadData, friends, groups]);

  const openPoiIdeasDialog = useCallback((poiId) => {
    setSelectedPoiId(poiId);
    setPoiIdeasOpen(true);
    }, []);

  const openCreateHangoutDialog = useCallback((poiId, poiName) => {
    setSelectedHangoutPoiId(poiId);
    setSelectedHangoutPoiName(poiName);
    setCreateHangoutOpen(true);
    }, []);

   // Determine which entity's placeIdeas to show in the shared picker
  const pickerFriends = (pickerEntityType === 'friend') ? [friends.find(f => f.id === pickerEntityId)].filter(Boolean) : friends;
  const pickerGroups = (pickerEntityType === 'group') ? [groups.find(g => g.id === pickerEntityId)].filter(Boolean) : groups;

  if (loading) {
    return (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
          <CircularProgress />
        </Box>
      );
    }

   const selectedFriend = friends.find((f) => f.id === selectedFriendId);

  return (
      <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 'none', mx: 0, width: '100%' }}>
         {/* Error Alerts */}
        {error && (
          <Snackbar open={!!error} autoHideDuration={6000} onClose={() => setError(null)}>
            <Alert severity="error" onClose={() => setError(null)} sx={{ width: '100%' }}>
              {error}
            </Alert>
          </Snackbar>
        )}

        {authError && (
          <Snackbar open={!!authError} autoHideDuration={null} onClose={() => setAuthError(null)}>
            <Alert severity="warning" onClose={() => setAuthError(null)} sx={{ width: '100%' }}>
              {authError}
            </Alert>
          </Snackbar>
        )}

         {/* Header - Title only (Add Friend button is in FriendList) */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="h4" fontWeight="bold">
          Friends Dashboard
          </Typography>
        </Box>

         {/* StatsGrid - Full Width, Spans Both Columns */}
        <StatsGrid friends={friends} plannedHangouts={plannedHangouts} />

         {/* Two-Column Dashboard Layout */}
        <Grid container spacing={{ xs: 2, sm: 3 }}>
{/* Left Column: Friend List */}
<Grid item xs={12} md={6}>
<FriendList
friends={friends}
cityCache={cityCache}
pois={pois}
selectedFriendId={selectedFriendId}
onSelectFriend={setSelectedFriendId}
onRecordContact={handleRecordContact}
onDeleteFriend={handleDeleteFriend}
onOpenDeleteConfirm={handleOpenDeleteConfirm}
onSetLastContactDate={handleSetLastContactDate}
onEditFriend={handleEditFriend}
onToggleAddForm={handleToggleAddForm}
onOpenPlaceIdeasPicker={openFriendPlaceIdeasPicker}
isAddFormOpen={showAddForm}
/>

            {showAddForm && (
              <Paper sx={{ mt: 2, p: 2 }}>
                <FriendForm
                onSave={async () => { await loadData(user); setEditingFriend(null); }}
                onClose={() => { setShowAddForm(false); setEditingFriend(null); }}
                editFriend={editingFriend}
                />
              </Paper>
            )}

             {/* Selected Friend Details */}
            {selectedFriend && (
              <Paper sx={{ mt: 2, p: 3, borderRadius: 2 }}>
                <Typography variant="h6" gutterBottom>
                  {selectedFriend.name} - Details
                </Typography>
                <Divider sx={{ my: 1 }} />

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Typography variant="body2">
                    <strong>Home:</strong> {selectedFriend.location?.homePoiId || 'Not set'}
                  </Typography>
                  {selectedFriend.location?.temporaryLocation?.poiId && (
                    <Typography variant="body2">
                      <strong>Temporary Location:</strong> {selectedFriend.location.temporaryLocation.poiId}
                      <br />
                    Start: {selectedFriend.location.temporaryLocation.startDate
                        ? new Date(selectedFriend.location.temporaryLocation.startDate).toLocaleDateString()
                        : 'N/A'}
                      <br />
                    End: {selectedFriend.location.temporaryLocation.endDate
                        ? new Date(selectedFriend.location.temporaryLocation.endDate).toLocaleDateString()
                        : 'N/A'}
                    </Typography>
                  )}

                   {/* Place Ideas chips for selected friend */}
                  {Array.isArray(selectedFriend.placeIdeas) && selectedFriend.placeIdeas.length > 0 && (
                    <Box sx={{ mt: 1 }}>
                      <Typography variant="caption" sx={{ display: 'block', fontWeight: 'bold', mb: 0.5 }}>
                        Place Ideas:
                      </Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {selectedFriend.placeIdeas.map((poiId) => {
                          const poi = pois.find(p => p.id === poiId);
                          return (
                            <Button
                              key={poiId}
                              size="small"
                              variant="outlined"
                              sx={{ fontSize: '10px' }}
                              onClick={() => setSelectedPoiId(poiId)}
                              title={poi?.name || poi?.location?.address || poiId}
                            >
                              {poi?.name || poiId}
                            </Button>
                          );
                        })}
                      </Box>
                    </Box>
                  )}
                </Box>

                 {/* Action buttons for selected friend */}
                <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                  <Button
                  variant="outlined"
                  size="small"
                  onClick={() => openPoiIdeasDialog(selectedFriend.location?.homePoiId)}
                  >
                  Add Home to Place Ideas
                  </Button>
                   {/* Open shared picker for this friend */}
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={openFriendPlaceIdeasPicker}
                    startIcon={<MapPin size={14} />}
                  >
                    Edit Place Ideas
                  </Button>
                </Box>
              </Paper>
            )}
          </Grid>

{/* Right Column: Hangouts, Groups */}
<Grid item xs={12} md={6}>
               {/* Hangout Scheduler (commitments, groups, plan/create buttons) */}
              <HangoutScheduler
              friends={friends}
              groups={groups}
              plannedHangouts={plannedHangouts}
              history={history}
              onAddPlannedHangout={handleAddPlannedHangout}
              onCompletePlannedHangout={handleCompletePlannedHangout}
              onAddGroup={handleAddGroup}
              onEditGroup={handleEditGroup}
              onDeleteGroup={handleDeleteGroup}
              onDeletePlannedHangout={handleDeletePlannedHangout}
              onEditPlannedHangout={handleEditPlannedHangout}
              onTriggerNotification={() => {}}
              editingGroup={editingGroup}
              setEditingGroup={setEditingGroup}
              editingHangout={editingHangout}
              isEditingHangoutMode={isEditingHangoutMode}
              onSaveHangout={handleSaveHangout}
              pois={pois}
              onPlanEvent={handlePlanEvent}
              onOpenGroupPlaceIdeasPicker={openGroupPlaceIdeasPicker}
              />
            </Grid>
        </Grid>

           {/* Legacy Place Ideas Dialog (for specific POI selection) */}
        <PoiIdeasDialog
         open={poiIdeasOpen && selectedPoiId !== null}
         onClose={() => { setPoiIdeasOpen(false); setSelectedPoiId(null); }}
         friends={friends}
         groups={groups}
         selectedPoiId={selectedPoiId}
         onTogglePlaceIdea={handleTogglePlaceIdea}
         />

          {/* Shared PoiIdeasPicker (for friend/group editing from dashboard) */}
          <PoiIdeasPicker
           open={poiIdeasOpen && pickerEntityId !== null}
           onClose={() => { setPoiIdeasOpen(false); }}
           // eslint-disable-next-line react-hooks/exhaustive-deps
           onTransitionCompleted={() => { setPickerEntityId(null); }}
           friends={pickerFriends}
           groups={groups}
           selectedPoiId={selectedFriend ? selectedFriend.location?.homePoiId : (groups.find(g => g.id === pickerEntityId)?.memberIds ? '__group_members__' : null)}
           selectedPoiName={(pickerEntityType === 'friend'
              ? friends.find(f => f.id === pickerEntityId)?.name
              : groups.find(g => g.id === pickerEntityId)?.name) || null}
           onTogglePlaceIdea={handleTogglePickerPlaceIdea}
          />

         {/* Create Hangout Dialog */}
        <CreateHangoutDialog
        open={createHangoutOpen}
        onClose={() => {
          setCreateHangoutOpen(false);
          setSelectedHangoutPoiId(null);
          setSelectedHangoutPoiName(null);
          }}
        onCreateHangout={handleCreateHangout}
        poiId={selectedHangoutPoiId}
        poiName={selectedHangoutPoiName}
        friends={friends}
        groups={groups}
         />

       {/* Delete Friend Confirmation Dialog */}
       <Dialog
         open={deleteConfirmOpen}
         onClose={handleCloseDeleteConfirm}
         maxWidth="sm"
         fullWidth
         PaperProps={{ sx: { borderRadius: 3 } }}
       >
         <DialogTitle sx={{ fontWeight: 700 }}>Remove Friend</DialogTitle>
         <DialogContent>
           <Typography variant="body2" sx={{ mb: 1.5 }}>
             Are you sure you want to remove <strong>{deleteTargetFriend?.name || 'this friend'}</strong>?
           </Typography>
           {deleteTargetFriend && (
             <Typography variant="body2" sx={{ color: 'text.secondary' }}>
               Home location: <strong>{resolveFriendHomeLocation(deleteTargetFriend, pois)}</strong>
             </Typography>
           )}
           <Typography variant="caption" sx={{ display: 'block', mt: 2, color: 'error.main' }}>
             This action cannot be undone. All hangout history and planning data will be permanently removed.
           </Typography>
         </DialogContent>
         <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
           <Button onClick={handleCloseDeleteConfirm}>Cancel</Button>
           <Button
             onClick={handleConfirmDeleteFriend}
             variant="contained"
             sx={{
               backgroundColor: '#c62828',
               '&:hover': { backgroundColor: '#b71c1c' },
             }}
           >
             Remove Friend
           </Button>
         </DialogActions>
       </Dialog>
     </Box>
   );
}
