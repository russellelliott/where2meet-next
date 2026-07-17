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
} from '@mui/material';
import { auth } from '../../firebaseConfig';
import FriendList from './FriendList';
import HangoutScheduler from './HangoutScheduler';
import StatsGrid from './StatsGrid';
import PoiIdeasDialog from './PoiIdeasDialog';
import CreateHangoutDialog from './CreateHangoutDialog';
import HangoutList from './HangoutList';
import { getFriends, getUserPoIs, recordContact as recordContactApi, deleteFriend } from '../../lib/friendService';
import { getGroups, addGroup as addGroupApi, updateGroup } from '../../lib/groupService';
import { getHangouts, createHangout as createHangoutApi, completeHangout } from '../../lib/hangoutService';

/**
 * Resolve a POI id to a city name using Google reverse geocoding.
 * Reads address_components for locality, falls back to postal_town > administrative_area_level_3 > sublocality.
 */
async function getCityFromPoiId(poiId, allPoIs) {
  const poi = allPoIs?.find((p) => p.id === poiId);
  if (!poi?.location?.lat || !poi.location.lng) return null;

  // If we already cached a city from the POI document, use it
  if (poi.city) return poi.city;

  try {
    if (typeof window.google !== 'undefined' && window.google.maps?.Geocoder) {
      const geocoder = new window.google.maps.Geocoder();
      return new Promise((resolve) => {
        geocoder.geocode({ location: { lat: poi.location.lat, lng: poi.location.lng } }, (results, status) => {
          if (status === 'OK' && results?.length) {
            const result = results[0];
            // Priority 1: locality
            let city = result.address_components.find((c) => c.types.includes('locality'))?.long_name;
            if (city) return resolve(city);
            // Fallbacks per Google guidance
            city = result.address_components.find((c) => c.types.includes('postal_town'))?.long_name;
            if (city) return resolve(city);
            city = result.address_components.find((c) => c.types.includes('administrative_area_level_3'))?.long_name;
            if (city) return resolve(city);
            city = result.address_components.find((c) => c.types.includes('sublocality'))?.long_name;
            if (city) return resolve(city);
          }
          resolve(null);
        });
      });
    }
  } catch (err) {
    console.warn('Reverse geocoding failed for POI', poiId, err);
  }
  return null;
}

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
 * Uses auth.onAuthStateChanged directly (same pattern as MasterMap.js) so that
 * Firebase Auth SDK and Firestore share the same internal auth state.
 * This prevents "Missing or insufficient permissions" errors on page reload.
 * @param {object} props - Component props
 * @param {function} props.onSignOut - Optional sign out callback
 */
export default function FriendsDashboard({ onSignOut }) {
  const [user, setUser] = useState(auth.currentUser);

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
        getFriends(currentUser.uid),
        getGroups(currentUser.uid),
        getHangouts(currentUser.uid),
        getUserPoIs(currentUser.uid),
      ]);

       // Flatten friend data from { id, data: {...} } to { id, ...data }
      const flattenedFriends = (friendsData || []).map(f => ({ ...f.data, id: f.id }));
      setFriends(flattenedFriends);
      setGroups(groupsData || []);
      setPoIs(poisData || []);

      // All hangouts (from friend planning + group planning + standalone)
      const allHangoutIds = new Set();
      (friendsData || []).forEach((f) => {
        (f.planning?.hangoutIds || []).forEach((id) => allHangoutIds.add(id));
      });
      (groupsData || []).forEach((g) => {
        (g.planning?.hangoutIds || []).forEach((id) => allHangoutIds.add(id));
      });

      setHangouts(hangoutsData || []);

      // Separate planned vs completed
      const now = new Date();
      const planned = (hangoutsData || []).filter((h) => new Date(h.datetime) >= now);
      const completed = (hangoutsData || []).filter((h) => new Date(h.datetime) < now);

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
   // POI data for city resolution (users/{uid}/poi subcollection)
  const [pois, setPoIs] = useState([]);
    // Cache of poiId → city name (resolved via Google reverse geocoding)
  const [cityCache, setCityCache] = useState({});

  // Build city cache when friends and POIs are loaded
   useEffect(() => {
     if (!friends.length || !pois.length) return;

     const newCache = { ...cityCache };
     let changed = false;

    friends.forEach((friend) => {
       const homeId = friend.location?.homePoiId;
       if (homeId && !newCache[homeId]) {
         const poi = pois.find((p) => p.id === homeId);
         if (poi?.location?.lat && poi.location.lng) {
           resolveCity(poi.location.lat, poi.location.lng).then((city) => {
             if (city) {
               setCityCache((prev) => ({ ...prev, [homeId]: city }));
             }
           });
           changed = true;
         }
       }
       const tempId = friend.location?.temporaryLocation?.poiId;
       if (tempId && !newCache[tempId]) {
         const poi = pois.find((p) => p.id === tempId);
         if (poi?.location?.lat && poi.location.lng) {
           resolveCity(poi.location.lat, poi.location.lng).then((city) => {
             if (city) {
               setCityCache((prev) => ({ ...prev, [tempId]: city }));
             }
           });
           changed = true;
         }
       }
     });

     if (!changed && !Object.keys(newCache).length) {
       // Reset cache so subsequent loads work
       setCityCache({});
     }
   }, [friends, pois]);

  /**
   * Resolve coordinates to a city name using Google reverse geocoding.
   */
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

  const handleDeleteFriend = useCallback(async (friendId) => {
    if (!confirm('Are you sure you want to delete this friend?')) return;
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

  const handleAddGroup = useCallback(async (groupData) => {
    if (!user) return;

    try {
      await addGroupApi(user.uid, groupData);
      await loadData(user);
    } catch (err) {
      console.error('Error adding group:', err);
      if (isAuthError(err)) {
        setAuthError('Session expired. Please sign in again.');
      } else {
        setError('Failed to add group.');
      }
    }
  }, [user, loadData]);

  const handleDeletePlannedHangout = useCallback(async (hangoutId) => {
    if (!confirm('Are you sure you want to cancel this hangout?')) return;
    if (!user || !hangoutId) return;

    try {
      await createHangoutApi(user.uid, { id: hangoutId, deleted: true });
      setHangouts((prev) => prev.filter((h) => h.id !== hangoutId));
      setPlannedHangouts((prev) => prev.filter((h) => h.id !== hangoutId));
    } catch (err) {
      console.error('Error deleting hangout:', err);
      if (isAuthError(err)) {
        setAuthError('Session expired. Please sign in again.');
      } else {
        setError('Failed to cancel hangout.');
      }
    }
  }, [user]);

  const handleCompletePlannedHangout = useCallback(async (hangoutId, actualDate, attendeeIds) => {
    if (!user || !hangoutId) return;

    try {
      // Update lastContactDate for all attendees
      for (const friendId of attendeeIds) {
        const friend = friends.find((f) => f.id === friendId);
        if (friend) {
          await updateGroup(user.uid, friendId, {
            ...friend,
            contact: {
              ...friend.contact,
              lastContactDate: actualDate,
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
    if (!user || !poiId) return;

    try {
      if (friendId) {
        const friend = friends.find((f) => f.id === friendId);
        if (friend) {
          const currentIdeas = friend.planning?.placeIdeas || [];
          const newIdeas = currentIdeas.includes(poiId)
            ? currentIdeas.filter((id) => id !== poiId)
            : [...currentIdeas, poiId];

          await updateGroup(user.uid, friendId, {
            ...friend,
            planning: {
              ...friend.planning,
              placeIdeas: newIdeas,
            },
          });
        }
      } else if (groupId) {
        const group = groups.find((g) => g.id === groupId);
        if (group) {
          const currentIdeas = group.planning?.placeIdeas || [];
          const newIdeas = currentIdeas.includes(poiId)
            ? currentIdeas.filter((id) => id !== poiId)
            : [...currentIdeas, poiId];

          await updateGroup(user.uid, groupId, {
            ...group,
            planning: {
              ...group.planning,
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
            await updateGroup(user.uid, friendId, {
              ...friend,
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
            ...group,
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

  const handleCompleteHangout = useCallback(async (hangoutId) => {
    if (!confirm('Mark this hangout as complete? This will update all friends\' lastContactDate.')) return;
    if (!user || !hangoutId) return;

    try {
      await completeHangout(user.uid, hangoutId);

      // Update friend records
      for (const friend of friends) {
        if ((friend.planning?.hangoutIds || []).includes(hangoutId)) {
          await updateGroup(user.uid, friend.id, {
            ...friend,
            contact: {
              ...friend.contact,
              lastContactDate: new Date().toISOString(),
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

  const handleToggleAddForm = useCallback(() => {
    setShowAddForm((prev) => !prev);
  }, []);

  const openPoiIdeasDialog = useCallback((poiId) => {
    setSelectedPoiId(poiId);
    setPoiIdeasOpen(true);
  }, []);

  const openCreateHangoutDialog = useCallback((poiId, poiName) => {
    setSelectedHangoutPoiId(poiId);
    setSelectedHangoutPoiName(poiName);
    setCreateHangoutOpen(true);
  }, []);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
        <CircularProgress />
      </Box>
    );
  }

  const selectedFriend = friends.find((f) => f.id === selectedFriendId);

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1400, mx: 'auto' }}>
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
          <Grid item xs={12} md={5}>
            <FriendList
             friends={friends}
             cityCache={cityCache}
             selectedFriendId={selectedFriendId}
             onSelectFriend={setSelectedFriendId}
             onRecordContact={handleRecordContact}
             onDeleteFriend={handleDeleteFriend}
             onToggleAddForm={handleToggleAddForm}
             isAddFormOpen={showAddForm}
            />

          {showAddForm && (
            <Paper sx={{ mt: 2, p: 2 }}>
              <FriendForm onSave={() => loadData(user)} onClose={() => setShowAddForm(false)} />
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
              </Box>
            </Paper>
          )}
        </Grid>

         {/* Right Column: Hangouts, Groups */}
         <Grid item xs={12} md={7}>
           {/* Hangout Scheduler (commitments, groups, plan/create buttons) */}
          <HangoutScheduler
            friends={friends}
            groups={groups}
            plannedHangouts={plannedHangouts}
            history={history}
            onAddPlannedHangout={() => {}}
            onCompletePlannedHangout={handleCompletePlannedHangout}
            onAddGroup={handleAddGroup}
            onDeletePlannedHangout={handleDeletePlannedHangout}
            onTriggerNotification={() => {}}
          />
        </Grid>
      </Grid>

      {/* HangoutList - upcoming & past hangouts */}
      <Box sx={{ mt: 3 }}>
        <HangoutList
          hangouts={hangouts}
          friends={friends}
          onCompleteHangout={handleCompleteHangout}
        />
      </Box>

      {/* Place Ideas Dialog */}
      <PoiIdeasDialog
        open={poiIdeasOpen}
        onClose={() => setPoiIdeasOpen(false)}
        friends={friends}
        groups={groups}
        selectedPoiId={selectedPoiId}
        onTogglePlaceIdea={handleTogglePlaceIdea}
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
    </Box>
  );
}

// Import FriendForm dynamically since it's only conditionally used
import FriendForm from './FriendForm';