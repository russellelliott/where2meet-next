import React, { useState, useRef, useEffect } from "react";
import { GoogleMap, Marker, InfoWindow, Autocomplete } from "@react-google-maps/api";
import { auth, db } from "../firebaseConfig";
import { collection, doc, deleteDoc, updateDoc, getDocs } from 'firebase/firestore';
import { toast } from 'react-toastify';
import { deletePoiWithCascades } from '../lib/deletionService';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Checkbox,
  FormControlLabel,
  List,
  ListItem,
  Divider,
} from '@mui/material';

import {
  createPoiFromPlaceResult,
  createPoiFromCoordinates,
} from "../lib/poiService";

import { togglePlaceIdeaTopLevel as toggleFriendPlaceIdeaTopLevel } from '../lib/friendService';
import { togglePlaceIdeaTopLevel as toggleGroupPlaceIdeaTopLevel } from '../lib/groupService';

const containerStyle = {
  width: "100%",
  height: "calc(100vh - 60px)"
};

const DEFAULT_CENTER = { lat: 37.7749, lng: -122.4194 };

// Google Maps icon URLs based on access and scope
const POI_ICONS = {
     'private-selective': 'https://maps.google.com/mapfiles/ms/icons/orange-dot.png',
     'private-all': 'https://maps.google.com/mapfiles/ms/icons/purple-dot.png',
     'public-selective': 'https://maps.google.com/mapfiles/ms/icons/pink-dot.png',
     'public-all': 'https://maps.google.com/mapfiles/ms/icons/green-dot.png',
};

const DEFAULT_POI_ICON = 'https://maps.google.com/mapfiles/ms/icons/red-dot.png';

// Friend POI icon (yellow home/property icon)
const FRIEND_POI_ICON = 'https://maps.google.com/mapfiles/ms/micons/homegardenbusiness.png';

function MasterMap() {
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [mapCenter, setMapCenter] = useState(DEFAULT_CENTER);
  const [userLocationLoaded, setUserLocationLoaded] = useState(false);
  const [allUserPOIs, setAllUserPOIs] = useState([]); // all POIs for this user (master view shows everything)
  const [loadingPOIs, setLoadingPOIs] = useState(false);
  const [editingPoi, setEditingPoi] = useState(null);
  const [editingPoiName, setEditingPoiName] = useState("");
  const [editingPoiNotes, setEditingPoiNotes] = useState("");
  const [editingPoiLinks, setEditingPoiLinks] = useState([]);
  const [editingPoiDate, setEditingPoiDate] = useState("");
  const [privacyEditor, setPrivacyEditor] = useState(null);
  const [privacyForm, setPrivacyForm] = useState({ access: 'public', scope: 'all', allowedMapIds: [] });
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [userMaps, setUserMaps] = useState([]);
  const [poiCountsByMap, setPoiCountsByMap] = useState({}); // { mapId: count }

    // Collapsible map group state (track which map groups are collapsed)
  const [collapsedMaps, setCollapsedMaps] = useState({}); // { mapName: boolean }

  const autocompleteRef = useRef(null);
  const mapRef = useRef(null);
  const [user, setUser] = useState(auth.currentUser);

   // Friends & groups data for place ideas picker
  const [friends, setFriends] = useState([]);
  const [groups, setGroups] = useState([]);

   // Friend POI association map: poiId -> [{ friendId, friendName, type, startDate?, endDate? }]
  const [friendPoiMap, setFriendPoiMap] = useState({});

   // Place Ideas Picker state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerPoiId, setPickerPoiId] = useState(null);
  const [pickerPoiName, setPickerPoiName] = useState(null);

   // Create Hangout Dialog state
  const [hangoutDialogOpen, setHangoutDialogOpen] = useState(false);
  const [hangoutPoiId, setHangoutPoiId] = useState(null);
  const [hangoutPoiName, setHangoutPoiName] = useState(null);

   // Hangout creation form state
  const [hangoutType, setHangoutType] = useState('physical');
  const [hangoutDatetime, setHangoutDatetime] = useState(null);
  const [hangoutDescription, setHangoutDescription] = useState('');
  const [selectedFriendIds, setSelectedFriendIds] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((loggedInUser) => {
      setUser(loggedInUser);
       });
    return () => unsubscribe();
     }, []);

      // Log API key availability for debugging
  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    console.log("MasterMap.js - API Key:", apiKey ? "Found" : "Missing");
     }, []);

      // Get user's location
  useEffect(() => {
    if (!userLocationLoaded && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
           (position) => {
          setMapCenter({
            lat: position.coords.latitude,
            lng: position.coords.longitude
             });
          setUserLocationLoaded(true);
           },
          () => setUserLocationLoaded(true),
           { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
          );
        } else {
      setUserLocationLoaded(true);
       }
      }, [userLocationLoaded]);

      // Load friends & groups data + build friend POI map
  useEffect(() => {
    if (!user) return;
    const loadData = async () => {
      try {
        const friendsSnap = await getDocs(collection(db, 'users', user.uid, 'friend'));
        const friendsData = friendsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setFriends(friendsData);

         // Build friend -> POI association map from current user's friends
        const fMapObj = {};
        friendsData.forEach(friend => {
          if (!friend.location) return;
           // Home POI
          if (friend.location.homePoiId) {
            if (!fMapObj[friend.location.homePoiId]) fMapObj[friend.location.homePoiId] = [];
            fMapObj[friend.location.homePoiId].push({ friendId: friend.id, friendName: friend.name, type: 'home' });
           }
           // Temporary Location POI - only count if active (no passed end date)
          if (friend.location.temporaryLocation?.poiId) {
            const tempLoc = friend.location.temporaryLocation;
             // Skip expired temporary locations
            if (tempLoc.endDate && new Date(tempLoc.endDate) < new Date()) return;
            const poiId = tempLoc.poiId;
            if (!fMapObj[poiId]) fMapObj[poiId] = [];
            fMapObj[poiId].push({
              friendId: friend.id, friendName: friend.name, type: 'temporary',
              startDate: tempLoc.startDate || null,
              endDate: tempLoc.endDate || null,
             });
           }
           // Pickup POI
          if (friend.logistics?.pickupPoiId) {
            if (!fMapObj[friend.logistics.pickupPoiId]) fMapObj[friend.logistics.pickupPoiId] = [];
            fMapObj[friend.logistics.pickupPoiId].push({ friendId: friend.id, friendName: friend.name, type: 'pickup' });
           }
         });
        setFriendPoiMap(fMapObj);

        const groupsSnap = await getDocs(collection(db, 'users', user.uid, 'group'));
        setGroups(groupsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
       } catch (err) {
        console.error("Failed to load friends/groups:", err);
       }
      };
    loadData();
     }, [user]);

      // Load user's maps for privacy scope selection + POI counts
  useEffect(() => {
    if (!user) return;
    const loadUserMaps = async () => {
      try {
        const mapsSnapshot = await getDocs(collection(db, 'maps'));
        const userMapsList = mapsSnapshot.docs
             .map(doc => ({ id: doc.id, ...doc.data() }))
             .filter(m => m.owner === user.uid);
        setUserMaps(userMapsList);
         } catch (err) {
        console.error("Failed to load user maps:", err);
         }
        };
    loadUserMaps();
     }, [user]);

      // Load all POIs from user's POI collection (no privacy filtering - owner sees everything)
  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    setLoadingPOIs(true);

    const loadPOIs = async () => {
      try {
        const poiSnapshot = await getDocs(collection(db, 'users', user.uid, 'poi'));

        if (cancelled) return;

        const pois = poiSnapshot.docs.map(docSnap => ({ ...docSnap.data(), id: docSnap.id }));
        setAllUserPOIs(pois);
         } catch (err) {
        console.error("Failed to load POIs:", err);
         } finally {
        if (!cancelled) setLoadingPOIs(false);
         }
       };

    loadPOIs();
    return () => { cancelled = true; };
      }, [user]);

    // Toggle collapsed state for a map group
  const toggleMapCollapse = (mapName) => {
    setCollapsedMaps(prev => ({ ...prev, [mapName]: !prev[mapName] }));
      };

       // Compute POI counts per map when POIs or maps change
  useEffect(() => {
    if (allUserPOIs.length === 0 || userMaps.length === 0) return;
    const counts = {};
    userMaps.forEach(m => { counts[m.id] = 0; });
    allUserPOIs.forEach(poi => {
      const visibility = poi.visibility || {};
      const scope = visibility.scope || 'selective';
      if (scope === 'all') {
         userMaps.forEach(m => { counts[m.id] = (counts[m.id] || 0) + 1; });
         } else if (scope === 'selective' && Array.isArray(visibility.allowedMapIds)) {
        visibility.allowedMapIds.forEach(mapId => { counts[mapId] = (counts[mapId] || 0) + 1; });
         }
        });
    setPoiCountsByMap(counts);
     }, [allUserPOIs, userMaps]);

      // Handle autocomplete place selection - creates POI with public/all visibility
  const onPlaceChanged = async () => {
    if (!user) return alert("Please sign in to save places");
    const place = autocompleteRef.current?.getPlace();
    if (!place?.geometry?.location) return;

    const placeName = place.name || place.formatted_address?.split(',')[0] || "Unknown Location";

    try {
      const newPoi = await createPoiFromPlaceResult({
        userId: user.uid,
        place,
        visibility: {
          access: 'public',    // Master Map forces public
          scope: 'all',         // Master Map forces all maps
           },
          });

      if (newPoi) {
        setAllUserPOIs(prev => [...prev, { ...newPoi, id: newPoi.id }]);
        setSelectedMarker({ ...newPoi, position: newPoi.location?.location || newPoi.location });
        setMapCenter(newPoi.location);
         }

      const input = document.querySelector('input[placeholder="Search for a place..."]');
      if (input) input.value = '';

      toast.success(`Added location (public): ${placeName}`);
       } catch (err) {
      console.error(err);
      alert("Error saving location. Please try again.");
       }
      };

      // Handle map click to add POIs with public/all visibility
  const onMapClick = async (event) => {
    if (!user) return alert("Please sign in to save places");
    if (selectedMarker) {
      setSelectedMarker(null);
      return;
       }

    const lat = event.latLng.lat();
    const lng = event.latLng.lng();

      // Use Google Geocoding API to get place information
    const geocoder = new window.google.maps.Geocoder();

    const geocodeResult = await new Promise((resolve, reject) => {
      geocoder.geocode(
           { location: { lat, lng } },
           (results, status) => {
          if (status === 'OK' && results[0]) {
            resolve(results[0]);
             } else {
            reject(new Error('Geocoding failed'));
             }
           }
          );
        });

    const place = geocodeResult;

    let name = "Unknown Location";

    const establishmentComponent = place.address_components?.find(
      component => component.types.includes('establishment') || component.types.includes('point_of_interest')
       );

    if (establishmentComponent) {
      name = establishmentComponent.long_name;
       } else {
      const streetNumber = place.address_components?.find(c => c.types.includes('street_number'))?.long_name;
      const route = place.address_components?.find(c => c.types.includes('route'))?.long_name;
      if (streetNumber && route) {
        name = `${streetNumber} ${route}`;
         } else if (route) {
        name = route;
         } else {
        name = place.address_components?.[0]?.long_name || place.formatted_address?.split(',')[0] || "Unknown Location";
         }
        }

    try {
      const newPoi = await createPoiFromCoordinates({
        userId: user.uid,
        lat,
        lng,
        visibility: {
          access: 'public',    // Master Map forces public
          scope: 'all',         // Master Map forces all maps
           },
          });

      if (newPoi) {
        setAllUserPOIs(prev => [...prev, { ...newPoi, id: newPoi.id }]);
        setSelectedMarker({ ...newPoi, position: newPoi.location?.location || newPoi.location });
        setMapCenter(newPoi.location);
         }

      toast.success(`Added location (public): ${name}`);
       } catch (poiErr) {
      console.error("Failed to create POI:", poiErr);
      toast.error("Error saving location. Please try again.");
       }
      };

        // Handle POI delete confirmation - uses cascade deletion
     const handleDeletePoi = async (poi) => {
    try {
      await deletePoiWithCascades(user.uid, poi.id);
      setAllUserPOIs(prev => prev.filter(p => p.id !== poi.id));
      if (selectedMarker?.id === poi.id) {
        setSelectedMarker(null);
          }
      setDeleteConfirm(null);
      toast.success("POI deleted successfully!");
          } catch (err) {
      console.error("Error deleting POI:", err);
      toast.error("Error deleting POI. Please try again.");
          }
        };

     // Start editing POI info
  const startEditingPoiInfo = (poi) => {
    setEditingPoi(poi);
    setEditingPoiName(poi.name || "");
    setEditingPoiNotes(poi.notes || "");
     // Initialize links as array or empty
    const links = poi.links;
    setEditingPoiLinks(Array.isArray(links) ? [...links] : []);
     // Initialize date
    setEditingPoiDate(poi.date || "");
   };

    // Add a link to the editing links array
  const addLinkToEditing = () => {
    setEditingPoiLinks(prev => [...prev, ""]);
   };

    // Remove a link from the editing links array by index
  const removeLinkFromEditing = (index) => {
    setEditingPoiLinks(prev => prev.filter((_, i) => i !== index));
   };

    // Update a link value in the editing links array by index
  const updateLinkInEditing = (index, value) => {
    setEditingPoiLinks(prev => prev.map((link, i) => i === index ? value : link));
   };

      // Save POI info edit
  const savePoiInfoEdit = async () => {
    if (!editingPoi) return;

    try {
      const poiRef = doc(db, 'users', user.uid, 'poi', editingPoi.id);
      
       // Build the data to save: links as array (or null if empty), date as string
      const linkData = editingPoiLinks.filter(l => l.trim()).length > 0 
         ? editingPoiLinks.map(l => l.trim()) 
         : null;

      await updateDoc(poiRef, {
        name: editingPoiName,
        notes: editingPoiNotes,
        links: linkData,
        date: editingPoiDate || null,
         });

       // Update local state with all fields
      const updatedPoi = { 
         ...editingPoi, 
        name: editingPoiName, 
        notes: editingPoiNotes,
        links: linkData,
        date: editingPoiDate || null,
       };
      setAllUserPOIs(prev => prev.map(p => p.id === editingPoi.id ? updatedPoi : p));

      if (selectedMarker?.id === editingPoi.id) {
        setSelectedMarker({ ...selectedMarker, name: editingPoiName, notes: editingPoiNotes });
         }

      setEditingPoi(null);
      setEditingPoiName("");
      setEditingPoiNotes("");
      setEditingPoiLinks([]);
      setEditingPoiDate("");
      toast.success("POI updated successfully!");
       } catch (err) {
      console.error("Error updating POI:", err);
      toast.error("Error updating POI. Please try again.");
       }
      };

  const cancelPoiInfoEdit = () => {
    setEditingPoi(null);
    setEditingPoiName("");
    setEditingPoiNotes("");
    setEditingPoiLinks([]);
    setEditingPoiDate("");
     };

      // Start editing POI privacy settings
  const startEditingPoiPrivacy = (poi) => {
    const visibility = poi.visibility || {};
    setPrivacyEditor(poi);
    setPrivacyForm({
      access: visibility.access || 'public',
      scope: visibility.scope || 'all',
      allowedMapIds: Array.isArray(visibility.allowedMapIds) ? [...visibility.allowedMapIds] : []
       });
      };

      // Save POI privacy settings
  const savePoiPrivacyEdit = async () => {
    if (!privacyEditor) return;

    try {
      const poiRef = doc(db, 'users', user.uid, 'poi', privacyEditor.id);
      await updateDoc(poiRef, {
        visibility: {
          access: privacyForm.access,
          scope: privacyForm.scope,
          allowedMapIds: privacyForm.allowedMapIds
           }
          });

      const updatedPoi = {
           ...privacyEditor,
        visibility: {
          access: privacyForm.access,
          scope: privacyForm.scope,
          allowedMapIds: privacyForm.allowedMapIds
           }
          };

      setAllUserPOIs(prev => prev.map(p => p.id === privacyEditor.id ? updatedPoi : p));

      if (selectedMarker?.id === privacyEditor.id) {
        setSelectedMarker(updatedPoi);
         }

      setPrivacyEditor(null);
      setPrivacyForm({ access: 'public', scope: 'all', allowedMapIds: [] });
      toast.success("POI privacy settings updated successfully!");
       } catch (err) {
      console.error("Error updating POI privacy:", err);
      toast.error("Error updating privacy settings. Please try again.");
       }
      };

  const cancelPoiPrivacyEdit = () => {
    setPrivacyEditor(null);
    setPrivacyForm({ access: 'public', scope: 'all', allowedMapIds: [] });
     };

      // Open Place Ideas Picker for a POI
  const openPlaceIdeasPicker = (poi) => {
    setPickerPoiId(poi.id);
    setPickerPoiName(poi.name || poi.id);
    setPickerOpen(true);
     };

      // Toggle place idea in friend/group via top-level field
  const handleTogglePickerPlaceIdea = async (entityType, entityId, poiId) => {
    if (!user || !entityId || !poiId) return;
    try {
      if (entityType === 'friend') {
        await toggleFriendPlaceIdeaTopLevel(user.uid, entityId, poiId);
         } else if (entityType === 'group') {
        await toggleGroupPlaceIdeaTopLevel(user.uid, entityId, poiId);
         }
          // Refresh friends/groups
      const friendsSnap = await getDocs(collection(db, 'users', user.uid, 'friend'));
      setFriends(friendsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      const groupsSnap = await getDocs(collection(db, 'users', user.uid, 'group'));
      setGroups(groupsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) {
      console.error("Error toggling place idea:", err);
      toast.error("Failed to update place idea.");
      }
      };

  const closePlaceIdeasPicker = () => {
    setPickerOpen(false);
    setPickerPoiId(null);
    setPickerPoiName(null);
     };

      // Open Create Hangout Dialog for a POI
  const openCreateHangoutDialog = (poi) => {
    setHangoutPoiId(poi.id);
    setHangoutPoiName(poi.name || poi.id);
    setHangoutType('physical');
    setHangoutDatetime(null);
    setHangoutDescription('');
    setSelectedFriendIds([]);
    setSelectedGroupId('');
    setHangoutDialogOpen(true);
     };

  const handleCreateHangout = async () => {
    if (!user || !hangoutPoiId) return;
    if (selectedFriendIds.length === 0 && !selectedGroupId) {
      toast.error('Please select at least one friend or a group.');
      return;
       }

    try {
      const hangoutData = {
        locationPoiId: hangoutPoiId,
        type: hangoutType,
        datetime: hangoutDatetime?.toISOString() || new Date().toISOString(),
        description: hangoutDescription.trim() || undefined,
        friendIds: selectedFriendIds.length > 0 ? selectedFriendIds : undefined,
        groupId: selectedGroupId || undefined,
         };

      const resp = await fetch('/api/hangouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.uid, hangoutData }),
         });

      if (!resp.ok) throw new Error('Failed to create hangout');

      toast.success('Hangout created successfully!');
      closeHangoutDialog();
      } catch (err) {
      console.error("Error creating hangout:", err);
      toast.error("Failed to create hangout.");
      }
     };

  const closeHangoutDialog = () => {
    setHangoutDialogOpen(false);
    setHangoutPoiId(null);
    setHangoutPoiName(null);
    setSelectedFriendIds([]);
    setSelectedGroupId('');
    setHangoutDatetime(null);
    setHangoutDescription('');
     };

  const toggleFriendSelection = (friendId) => {
    if (selectedFriendIds.includes(friendId)) {
      setSelectedFriendIds(selectedFriendIds.filter(id => id !== friendId));
       } else {
      setSelectedFriendIds([...selectedFriendIds, friendId]);
       }
      };

   // Helper: check if a POI is friend-associated
  const isFriendPoi = (poiId) => {
    return friendPoiMap[poiId] && friendPoiMap[poiId].length > 0;
   };

   // Get the Google Maps icon URL for a POI based on its visibility settings and friend association
  const getPoiIcon = (poi) => {
     // Friend-associated POIs get the yellow home icon
    if (isFriendPoi(poi.id)) {
      return FRIEND_POI_ICON;
     }
    const visibility = poi.visibility || {};
    const access = visibility.access || 'public';
    const scope = visibility.scope || 'all';
    return POI_ICONS[`${access}-${scope}`] || DEFAULT_POI_ICON;
     };

      // Get the label text for a POI's visibility badge
  const getPoiBadgeLabel = (poi) => {
    const visibility = poi.visibility || {};
    const access = visibility.access || 'public';
    const scope = visibility.scope || 'all';
    if (access === 'public' && scope === 'all') return 'Public All';
    if (access === 'public' && scope === 'selective') return 'Public Selective';
    if (access === 'private' && scope === 'all') return 'Private All';
    if (access === 'private' && scope === 'selective') return 'Private Selective';
    return 'Public All';
     };

      // Color for the visibility badge
  const getPoiBadgeColor = (poi) => {
     // Friend POIs get yellow badge
    if (isFriendPoi(poi.id)) {
      return '#fbc02d'; // Yellow
     }
    const visibility = poi.visibility || {};
    const access = visibility.access || 'public';
    const scope = visibility.scope || 'all';
    const colors = {
         'private-selective': '#ff9800',
         'private-all': '#9c27b0',
         'public-selective': '#e91e8c',
         'public-all': '#4caf50',
       };
    return colors[`${access}-${scope}`] || '#757575';
     };

   // Format friend association label for a POI
  const formatFriendAssociationLabel = (poiId) => {
    const associations = friendPoiMap[poiId];
    if (!associations || associations.length === 0) return null;

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
   };

   // Get place idea contributor names for a POI
  const getPlaceIdeaContributors = (poiId) => {
    const contributorNames = [];
    
     // Check friends
    friends.forEach(friend => {
      if (Array.isArray(friend.placeIdeas) && friend.placeIdeas.includes(poiId)) {
        contributorNames.push(`Friend: ${friend.name}`);
       }
     });

     // Check groups
    groups.forEach(group => {
      if (Array.isArray(group.placeIdeas) && group.placeIdeas.includes(poiId)) {
        contributorNames.push(`Group: ${group.name}`);
       }
     });

    return contributorNames.length > 0 ? contributorNames : null;
   };

  if (!user) return <div>Please sign in to view and edit maps.</div>;

   // Separate POIs into friend POIs and regular POIs
  const friendPois = allUserPOIs.filter(poi => isFriendPoi(poi.id));
  const regularPois = allUserPOIs.filter(poi => !isFriendPoi(poi.id));

    // Group regular POIs by map they belong to (based on allowedMapIds or "all maps")
  const poisByMap = {};
  const mapOrder = []; // track order of maps for consistent display
  regularPois.forEach(poi => {
    const visibility = poi.visibility || {};
    const scope = visibility.scope || 'selective';
    if (scope === 'all') {
      if (!poisByMap['All Maps']) poisByMap['All Maps'] = [];
      poisByMap['All Maps'].push(poi);
      if (!mapOrder.includes('All Maps')) mapOrder.push('All Maps');
      } else if (scope === 'selective' && Array.isArray(visibility.allowedMapIds)) {
      visibility.allowedMapIds.forEach(mapId => {
        const userMap = userMaps.find(m => m.id === mapId);
        const mapName = userMap ? userMap.name : `Unknown Map (${mapId.slice(0, 5)}...)`;
        if (!poisByMap[mapName]) poisByMap[mapName] = [];
        poisByMap[mapName].push(poi);
        if (!mapOrder.includes(mapName)) mapOrder.push(mapName);
        });
      }
    });

  return (
        <div style={{ display: 'flex', height: '100%' }}>
            {/* Left Sidebar */}
            <div style={{
           width: '350px',
           padding: '20px',
           borderRight: '1px solid #ddd',
           backgroundColor: '#f9f9f9'
             }}>
           {/* Search input */}
           <div style={{ marginBottom: '20px' }}>
             <h3 style={{ margin: '0 0 10px 0', fontSize: '16px' }}>Add New Location</h3>
             <Autocomplete
            onLoad={autocomplete => autocompleteRef.current = autocomplete}
            onPlaceChanged={onPlaceChanged}
             >
               <input
              type="text"
              placeholder="Search for a place..."
              style={{
                width: '100%',
                padding: '8px',
                fontSize: '14px',
                border: '1px solid #ccc',
                borderRadius: '4px'
                 }}
               />
             </Autocomplete>
             <p style={{ fontSize: '12px', color: '#666', margin: '5px 0 0 0' }}>
            Or click on the map to add a marker (will be public)
             </p>
           </div>

            {/* POIs List - all POIs for this user */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h3 style={{ margin: 0, fontSize: '16px' }}>
             All Locations ({allUserPOIs.length})
                </h3>
              </div>

              {/* Scrollable POI list container */}
              {/* Taller maxHeight since MasterMap has no Invite section */}
              <div style={{ maxHeight: 'calc(100vh - 320px)', overflowY: 'auto', paddingRight: '5px' }}>
             {loadingPOIs && <span style={{ fontSize: '12px', color: '#666' }}>Loading...</span>}

{/* Friend POIs section - collapsible */}
{friendPois.length > 0 && (
<div style={{ marginBottom: '12px' }}>
<div 
style={{
fontSize: '12px',
fontWeight: 'bold',
color: '#666',
textTransform: 'uppercase',
letterSpacing: '0.5px',
padding: '4px 0',
display: 'flex',
alignItems: 'center',
gap: '4px',
cursor: 'pointer',
}}
onClick={() => toggleMapCollapse('Friend Locations')}
>
<span style={{ fontSize: '10px' }}>{collapsedMaps['Friend Locations'] ? '▶' : '▼'}</span>
Friend Locations ({friendPois.length})
</div>
{!collapsedMaps['Friend Locations'] && friendPois.map(poi => renderPoiItem(poi))}
</div>
)}

             {/* Regular POIs grouped by map - using mapOrder for consistent display */}
             {mapOrder.filter(name => name !== 'All Maps').map(mapName => {
              const pois = poisByMap[mapName];
              if (!pois || pois.length === 0) return null;
              const isCollapsed = !!collapsedMaps[mapName];
              return (
                 <div key={`map-group-${mapName}`} style={{ marginBottom: '12px' }}>
                   <div 
                    style={{
                      fontSize: '12px',
                      fontWeight: 'bold',
                      color: '#4285f4',
                      cursor: 'pointer',
                      padding: '4px 0',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                     }}
                    onClick={() => toggleMapCollapse(mapName)}
                   >
                     <span style={{ fontSize: '10px' }}>{isCollapsed ? '▶' : '▼'}</span>
                     {mapName} ({pois.length})
                   </div>
                   {!isCollapsed && pois.map(p => renderPoiItem(p))}
                 </div>
               );
             })}

              {/* POIs on all maps that don't belong to any specific map */}
              {(poisByMap['All Maps'] || []).length > 0 && (() => {
                const allMapsPois = poisByMap['All Maps'];
                const isCollapsed = !!collapsedMaps['All Maps'];
                return (
                   <div style={{ marginBottom: '12px' }}>
                    <div 
                     style={{
                       fontSize: '12px',
                       fontWeight: 'bold',
                       color: '#4285f4',
                       cursor: 'pointer',
                       padding: '4px 0',
                       display: 'flex',
                       alignItems: 'center',
                       gap: '4px',
                      }}
                     onClick={() => toggleMapCollapse('All Maps')}
                    >
                      <span style={{ fontSize: '10px' }}>{isCollapsed ? '▶' : '▼'}</span>
                     All Maps ({allMapsPois.length})
                    </div>
                    {!isCollapsed && allMapsPois.map(p => renderPoiItem(p))}
                  </div>
                );
              })()}

               {!loadingPOIs && allUserPOIs.length === 0 && (
                 <p style={{ textAlign: 'center', color: '#666', fontStyle: 'italic', fontSize: '12px' }}>
              No locations yet. Search for a place or click on the map to add one.
                 </p>
               )}
             </div>
           </div>
         </div>

        {/* Main Map Area */}
       <div style={{ flex: 1, position: 'relative' }}>
        <GoogleMap
        mapContainerStyle={{ width: '100%', height: '100%' }}
        center={mapCenter}
        zoom={10}
        onClick={onMapClick}
        onLoad={map => mapRef.current = map}
        >
          {/* All POI markers */}
          {allUserPOIs.map(poi => (
            <Marker
            key={`poi-${poi.id}`}
            position={poi.location?.location || poi.location}
            icon={getPoiIcon(poi)}
            onClick={() => setSelectedMarker({ ...poi, position: poi.location?.location || poi.location })}
            />
          ))}

          {/* InfoWindow */}
          {selectedMarker && (
            <InfoWindow
            position={selectedMarker.position}
            onCloseClick={() => setSelectedMarker(null)}
            >
              <div style={{ maxWidth: 300 }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '16px' }}>{selectedMarker.name}</h4>
                {selectedMarker.location?.address && (
                  <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#666' }}>
                    &shy; {selectedMarker.location.address}
                  </p>
                )}
                {/* Show friend associations below address for friend POIs */}
                {isFriendPoi(selectedMarker.id) && (
                  <div style={{ fontSize: '11px', color: '#fbc02d', margin: '4px 0 0 0' }}>
                    {formatFriendAssociationLabel(selectedMarker.id)}
                  </div>
                )}
                {/* Show place idea contributors */}
                {selectedMarker.id && (() => {
                  const contributors = getPlaceIdeaContributors(selectedMarker.id);
                  return contributors && contributors.length > 0 ? (
                     <div style={{ fontSize: '11px', color: '#666', margin: '4px 0 0 0' }}>
                      Suggested by: {contributors.join(', ')}
                     </div>
                   ) : null;
                })()}
                {selectedMarker.notes && (
                  <p style={{ margin: '0 0 8px 0', fontSize: '14px' }}>
                    &bull; {selectedMarker.notes}
                  </p>
                )}
                {selectedMarker.date && (
                  <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#666' }}>
                    📅 {new Date(selectedMarker.date).toLocaleDateString()}
                  </p>
                )}
                {/* Show links as clickable */}
                {selectedMarker.links && Array.isArray(selectedMarker.links) && selectedMarker.links.length > 0 && (
                  <div style={{ margin: '4px 0 0 0' }}>
                    {selectedMarker.links.map((link, idx) => (
                      <a
                       key={idx}
                       href={link}
                       target="_blank"
                       rel="noopener noreferrer"
                       style={{ fontSize: '12px', color: '#1a73e8', textDecoration: 'underline', display: 'block' }}
                       onClick={(e) => e.stopPropagation()}
                      >
                        {link}
                      </a>
                    ))}
                  </div>
                )}
                {/* Show visibility badge for POI markers */}
                {selectedMarker.visibility && (
                  <div style={{
                  backgroundColor: getPoiBadgeColor(selectedMarker),
                  color: 'white',
                  fontSize: '10px',
                  padding: '2px 8px',
                  borderRadius: '3px',
                  display: 'inline-block',
                  marginTop: '4px'
                  }}>
                    {getPoiBadgeLabel(selectedMarker)}
                  </div>
                )}
                {/* Action buttons for POI in info window */}
                {selectedMarker.visibility && (
                  <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                    <button
                    onClick={() => startEditingPoiInfo(selectedMarker)}
                    style={{
                      padding: '4px 8px',
                      fontSize: '12px',
                      border: '1px solid #4285f4',
                      borderRadius: '4px',
                      backgroundColor: 'white',
                      color: '#4285f4',
                      cursor: 'pointer'
                      }}
                    >
                    Edit Info
                    </button>
                    <button
                    onClick={() => startEditingPoiPrivacy(selectedMarker)}
                    style={{
                      padding: '4px 8px',
                      fontSize: '12px',
                      border: `1px solid ${getPoiBadgeColor(selectedMarker)}`,
                      borderRadius: '4px',
                      backgroundColor: getPoiBadgeColor(selectedMarker),
                      color: 'white',
                      cursor: 'pointer'
                      }}
                    >
                    Privacy Settings
                    </button>
                    <button
                    onClick={() => openPlaceIdeasPicker(selectedMarker)}
                    style={{
                      padding: '4px 8px',
                      fontSize: '12px',
                      border: '1px solid #2196f3',
                      borderRadius: '4px',
                      backgroundColor: '#e3f2fd',
                      color: '#1565c0',
                      cursor: 'pointer'
                      }}
                    >
                      + Place Ideas
                    </button>
                      <button
                     onClick={() => setDeleteConfirm(selectedMarker)}
                    style={{
                      padding: '4px 8px',
                      fontSize: '12px',
                      border: '1px solid #ff4444',
                      borderRadius: '4px',
                      backgroundColor: 'white',
                      color: '#ff4444',
                      cursor: 'pointer'
                      }}
                    >
                    Delete
                    </button>
                  </div>
                )}
              </div>
            </InfoWindow>
          )}
        </GoogleMap>

        {/* POI Info Editing Modal */}
        {editingPoi && (
          <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          backgroundColor: 'white',
          padding: '20px',
          borderRadius: '8px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          zIndex: 1000,
          minWidth: '350px'
          }}>
            <h3 style={{ margin: '0 0 15px 0', fontSize: '18px' }}>Edit POI Info</h3>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: 'bold' }}>
              Name:
              </label>
              <input
              type="text"
              value={editingPoiName}
              onChange={(e) => setEditingPoiName(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                fontSize: '14px',
                border: '1px solid #ccc',
                borderRadius: '4px'
                }}
              />
            </div>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: 'bold' }}>
              Notes:
              </label>
              <textarea
              value={editingPoiNotes}
              onChange={(e) => setEditingPoiNotes(e.target.value)}
              rows={3}
              style={{
                width: '100%',
                padding: '8px',
                fontSize: '14px',
                border: '1px solid #ccc',
                borderRadius: '4px',
                resize: 'vertical'
                }}
              placeholder="Add any notes about this location..."
              />
            </div>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: 'bold' }}>
              Date:
              </label>
              <input
              type="date"
              value={editingPoiDate}
              onChange={(e) => setEditingPoiDate(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                fontSize: '14px',
                border: '1px solid #ccc',
                borderRadius: '4px'
                }}
              />
            </div>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: 'bold' }}>
              Links:
              </label>
              {(editingPoiLinks || []).length === 0 ? (
                <p style={{ fontSize: '12px', color: '#999', fontStyle: 'italic', margin: '0 0 8px 0' }}>No links added</p>
              ) : (
                <div style={{ marginBottom: '8px' }}>
                  {editingPoiLinks.map((link, index) => (
                    <div key={index} style={{ display: 'flex', gap: '5px', marginBottom: '5px', alignItems: 'center' }}>
                      <input
                      type="url"
                      value={link}
                      onChange={(e) => updateLinkInEditing(index, e.target.value)}
                      placeholder="https://example.com"
                      style={{
                        flex: 1,
                        padding: '6px',
                        fontSize: '12px',
                        border: '1px solid #ccc',
                        borderRadius: '4px'
                        }}
                      />
                      <button
                      onClick={() => removeLinkFromEditing(index)}
                      style={{
                        padding: '4px 8px',
                        fontSize: '12px',
                        border: '1px solid #ff4444',
                        borderRadius: '3px',
                        backgroundColor: '#ffebee',
                        color: '#ff4444',
                        cursor: 'pointer'
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button
              onClick={addLinkToEditing}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                border: '1px solid #4285f4',
                borderRadius: '3px',
                backgroundColor: '#e3f2fd',
                color: '#1565c0',
                cursor: 'pointer'
                }}
              >
                + Add Link
              </button>
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
              onClick={cancelPoiInfoEdit}
              style={{
                padding: '8px 16px',
                fontSize: '14px',
                border: '1px solid #ccc',
                borderRadius: '4px',
                backgroundColor: 'white',
                cursor: 'pointer'
                }}
              >
              Cancel
              </button>
              <button
              onClick={savePoiInfoEdit}
              style={{
                padding: '8px 16px',
                fontSize: '14px',
                border: 'none',
                borderRadius: '4px',
                backgroundColor: '#4285f4',
                color: 'white',
                cursor: 'pointer'
                }}
              >
              Save
              </button>
            </div>
          </div>
        )}

        {/* POI Privacy Settings Edit Modal */}
        {privacyEditor && (
          <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          backgroundColor: 'white',
          padding: '20px',
          borderRadius: '8px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          zIndex: 1000,
          minWidth: '350px'
          }}>
            <h3 style={{ margin: '0 0 15px 0', fontSize: '18px' }}>POI Privacy Settings</h3>

            {/* Access Level */}
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: 'bold' }}>
              Access Level:
              </label>
              <select
              value={privacyForm.access}
              onChange={(e) => setPrivacyForm({ ...privacyForm, access: e.target.value })}
              style={{
                width: '100%',
                padding: '8px',
                fontSize: '14px',
                border: '1px solid #ccc',
                borderRadius: '4px'
                }}
              >
                <option value="private">Private</option>
                <option value="public">Public</option>
              </select>
            </div>

            {/* Scope */}
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: 'bold' }}>
              Scope:
              </label>
              <select
              value={privacyForm.scope}
              onChange={(e) => setPrivacyForm({ ...privacyForm, scope: e.target.value })}
              style={{
                width: '100%',
                padding: '8px',
                fontSize: '14px',
                border: '1px solid #ccc',
                borderRadius: '4px'
                }}
              >
                <option value="all">All Maps</option>
                <option value="selective">Selective</option>
              </select>
            </div>

            {/* Allowed Maps (only shown if scope is selective) */}
            {privacyForm.scope === 'selective' && (
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: 'bold' }}>
                Allowed Maps:
                </label>
                <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #ccc', borderRadius: '4px', padding: '8px' }}>
                  {userMaps.map(userMap => (
                    <div key={userMap.id} style={{ display: 'flex', alignItems: 'center', marginBottom: '5px' }}>
                      <input
                      type="checkbox"
                      id={`map-${userMap.id}`}
                      checked={privacyForm.allowedMapIds.includes(userMap.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setPrivacyForm({
                              ...privacyForm,
                            allowedMapIds: [...privacyForm.allowedMapIds, userMap.id]
                            });
                        } else {
                          setPrivacyForm({
                              ...privacyForm,
                            allowedMapIds: privacyForm.allowedMapIds.filter(id => id !== userMap.id)
                            });
                        }
                      }}
                      />
                      <label htmlFor={`map-${userMap.id}`} style={{ marginLeft: '8px', fontSize: '14px', flex: 1 }}>
                        {userMap.name || 'Untitled Map'}
                      </label>
                      <span style={{ fontSize: '11px', color: '#666' }}>
                        ({poiCountsByMap[userMap.id] || 0} POIs)
                      </span>
                    </div>
                  ))}
                  {userMaps.length === 0 && (
                    <p style={{ fontSize: '12px', color: '#666', fontStyle: 'italic' }}>
                    No maps found.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Current privacy indicator */}
            <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
              <span style={{ fontSize: '12px', color: '#666' }}>Current privacy: </span>
              <span style={{
              display: 'inline-block',
              padding: '2px 8px',
              backgroundColor: getPoiBadgeColor(privacyEditor),
              color: 'white',
              fontSize: '11px',
              borderRadius: '3px',
              marginLeft: '5px'
              }}>
                {getPoiBadgeLabel(privacyEditor)}
              </span>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
              onClick={cancelPoiPrivacyEdit}
              style={{
                padding: '8px 16px',
                fontSize: '14px',
                border: '1px solid #ccc',
                borderRadius: '4px',
                backgroundColor: 'white',
                cursor: 'pointer'
                }}
              >
              Cancel
              </button>
              <button
              onClick={savePoiPrivacyEdit}
              style={{
                padding: '8px 16px',
                fontSize: '14px',
                border: 'none',
                borderRadius: '4px',
                backgroundColor: getPoiBadgeColor(privacyEditor),
                color: 'white',
                cursor: 'pointer'
                }}
              >
              Save
              </button>
            </div>
          </div>
        )}

        {/* POI Delete Confirmation Modal */}
        {deleteConfirm && (
          <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          backgroundColor: 'white',
          padding: '20px',
          borderRadius: '8px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          zIndex: 1000,
          minWidth: '350px'
          }}>
            <h3 style={{ margin: '0 0 15px 0', fontSize: '18px', color: '#ff4444' }}>Delete POI</h3>

            <div style={{ marginBottom: '15px' }}>
              <p style={{ margin: '0 0 10px 0', fontSize: '14px' }}>Are you sure you want to delete this POI? This action cannot be undone.</p>

              <div style={{ backgroundColor: '#f5f5f5', padding: '12px', borderRadius: '4px' }}>
                <div style={{ marginBottom: '8px' }}>
                  <strong>Name:</strong> {deleteConfirm.name}
                </div>
                <div style={{ marginBottom: '8px' }}>
                  <strong>Coordinates:</strong> {deleteConfirm.location?.lat?.toFixed(6)}, {deleteConfirm.location?.lng?.toFixed(6)}
                </div>
                <div style={{ marginBottom: '8px' }}>
                  <strong>Place ID:</strong> {deleteConfirm.location?.googlePlaceId || (deleteConfirm.location?.location?.googlePlaceId || 'N/A')}
                </div>
                {deleteConfirm.visibility && (
                  <div>
                    <strong>Privacy State:{' '}
                      <span style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      backgroundColor: getPoiBadgeColor(deleteConfirm),
                      color: 'white',
                      fontSize: '12px',
                      borderRadius: '3px',
                      marginLeft: '5px'
                      }}>
                        {getPoiBadgeLabel(deleteConfirm)}
                      </span>
                    </strong>
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
               <button
               onClick={() => setDeleteConfirm(null)}
               style={{
                 padding: '8px 16px',
                 fontSize: '14px',
                 border: '1px solid #ccc',
                 borderRadius: '4px',
                 backgroundColor: 'white',
                 cursor: 'pointer'
                 }}
               >
               Cancel
               </button>
               <button
               onClick={() => handleDeletePoi(deleteConfirm)}
              style={{
                padding: '8px 16px',
                fontSize: '14px',
                border: 'none',
                borderRadius: '4px',
                backgroundColor: '#ff4444',
                color: 'white',
                cursor: 'pointer'
                }}
              >
              Delete
              </button>
            </div>
          </div>
        )}

        {/* Place Ideas Picker Dialog */}
        <Dialog open={pickerOpen} onClose={closePlaceIdeasPicker} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 2 } }}>
         <DialogTitle>{'Add "' + (pickerPoiName || pickerPoiId) + '" to Place Ideas'}</DialogTitle>
         <DialogContent>
           <Box sx={{ display: 'flex', gap: 3, mt: 1 }}>
             {/* Left Column: Friends */}
             <Box sx={{ flex: 1 }}>
               <Typography variant="subtitle2" gutterBottom fontWeight="bold">Friends</Typography>
               <Divider sx={{ mb: 1 }} />
               <List dense sx={{ maxHeight: 300, overflowY: 'auto' }}>
                 {friends.map((friend) => {
                 const isChecked = Array.isArray(friend.placeIdeas) && friend.placeIdeas.includes(pickerPoiId);
                 return (
                     <ListItem key={friend.id}>
                       <FormControlLabel
                       control={
                            <Checkbox
                          checked={!!isChecked}
                          onChange={() => handleTogglePickerPlaceIdea('friend', friend.id, pickerPoiId)}
                          size="small"
                            />
                          }
                       label={<Typography variant="body2">{friend.name}</Typography>}
                       />
                     </ListItem>
                   );
                 })}
                 {friends.length === 0 && (
                   <Typography variant="caption" color="text.secondary" sx={{ p: 1 }}>No friends yet.</Typography>
                 )}
               </List>
             </Box>

             {/* Right Column: Groups */}
             <Box sx={{ flex: 1 }}>
               <Typography variant="subtitle2" gutterBottom fontWeight="bold">Groups</Typography>
               <Divider sx={{ mb: 1 }} />
               <List dense sx={{ maxHeight: 300, overflowY: 'auto' }}>
                 {groups.map((group) => {
                 const isChecked = Array.isArray(group.placeIdeas) && group.placeIdeas.includes(pickerPoiId);
                 return (
                     <ListItem key={group.id}>
                       <FormControlLabel
                       control={
                            <Checkbox
                          checked={!!isChecked}
                          onChange={() => handleTogglePickerPlaceIdea('group', group.id, pickerPoiId)}
                          size="small"
                            />
                          }
                       label={
                            <Box>
                              <Typography variant="body2">{group.name}</Typography>
                              {group.memberIds && group.memberIds.length > 0 && (
                                <Typography variant="caption" color="text.secondary">
                                  ({group.memberIds.length} members)
                                </Typography>
                              )}
                            </Box>
                          }
                       />
                     </ListItem>
                   );
                 })}
                 {groups.length === 0 && (
                   <Typography variant="caption" color="text.secondary" sx={{ p: 1 }}>No groups yet.</Typography>
                 )}
               </List>
             </Box>
           </Box>
         </DialogContent>
         <DialogActions sx={{ p: 2, gap: 1 }}>
           <Button onClick={closePlaceIdeasPicker}>Close</Button>
         </DialogActions>
        </Dialog>

        {/* Create Hangout Dialog */}
        <Dialog open={hangoutDialogOpen} onClose={closeHangoutDialog} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 2 } }}>
         <DialogTitle>Create Hangout at {hangoutPoiName || hangoutPoiId}</DialogTitle>
         <DialogContent>
           <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
             {/* Hangout Type */}
             <Box>
               <Typography variant="subtitle2" gutterBottom>Type</Typography>
               <Box sx={{ display: 'flex', gap: 2 }}>
                 <button
               onClick={() => setHangoutType('physical')}
               style={{
                 padding: '6px 14px',
                 border: hangoutType === 'physical' ? '2px solid #1565c0' : '1px solid #ccc',
                 borderRadius: '4px',
                 backgroundColor: hangoutType === 'physical' ? '#e3f2fd' : 'white',
                 color: hangoutType === 'physical' ? '#1565c0' : '#333',
                 cursor: 'pointer',
                 fontSize: '13px',
                 }}
                >Physical</button>
                 <button
               onClick={() => setHangoutType('virtual')}
               style={{
                 padding: '6px 14px',
                 border: hangoutType === 'virtual' ? '2px solid #1565c0' : '1px solid #ccc',
                 borderRadius: '4px',
                 backgroundColor: hangoutType === 'virtual' ? '#e3f2fd' : 'white',
                 color: hangoutType === 'virtual' ? '#1565c0' : '#333',
                 cursor: 'pointer',
                 fontSize: '13px',
                 }}
                >Virtual</button>
               </Box>
             </Box>

             {/* Date/Time */}
             <Box>
               <Typography variant="subtitle2" gutterBottom>Date & Time</Typography>
               <input
             type="datetime-local"
             value={hangoutDatetime ? hangoutDatetime.toISOString().slice(0, 16) : ''}
             onChange={(e) => setHangoutDatetime(new Date(e.target.value))}
             style={{
               width: '100%',
               padding: '8px',
               border: '1px solid #ccc',
               borderRadius: '4px',
               fontSize: '14px',
               }}
              />
             </Box>

             {/* Description */}
             <Box>
               <Typography variant="subtitle2" gutterBottom>Description (optional)</Typography>
               <textarea
             value={hangoutDescription}
             onChange={(e) => setHangoutDescription(e.target.value)}
             rows={3}
             style={{
               width: '100%',
               padding: '8px',
               border: '1px solid #ccc',
               borderRadius: '4px',
               fontSize: '14px',
               resize: 'vertical',
               }}
             placeholder="Add notes about this hangout..."
              />
             </Box>

             <Divider />

             {/* Friends Selection (Multi-select checkboxes) */}
             <Box>
               <Typography variant="subtitle2" gutterBottom>Invite Friends</Typography>
               <Box sx={{ border: '1px solid #e0e0e0', borderRadius: 1, maxHeight: 150, overflowY: 'auto', p: 1 }}>
                 {friends.length === 0 && (
                   <Typography variant="caption" color="text.secondary">No friends available.</Typography>
                 )}
                 {friends.map((friend) => (
                   <Box key={friend.id} sx={{ display: 'flex', alignItems: 'center', py: 0.5 }}>
                     <Checkbox
                    checked={selectedFriendIds.includes(friend.id)}
                    onChange={() => toggleFriendSelection(friend.id)}
                    size="small"
                     />
                     <Typography variant="body2">{friend.name}</Typography>
                   </Box>
                 ))}
               </Box>
             </Box>

             {/* Group Selection (Single-select radio) */}
             <Box>
               <Typography variant="subtitle2" gutterBottom>Select Group</Typography>
               <Box sx={{ border: '1px solid #e0e0e0', borderRadius: 1, maxHeight: 150, overflowY: 'auto', p: 1 }}>
                 {groups.length === 0 && (
                   <Typography variant="caption" color="text.secondary">No groups available.</Typography>
                 )}
                 {groups.map((group) => (
                   <Box key={group.id} sx={{ display: 'flex', alignItems: 'center', py: 0.5 }}>
                     <input
                    type="radio"
                    name="hangoutGroup"
                    checked={selectedGroupId === group.id}
                    onChange={() => setSelectedGroupId(group.id)}
                    style={{ marginRight: 8 }}
                     />
                     <Typography variant="body2">{group.name}</Typography>
                   </Box>
                 ))}
               </Box>
             </Box>
           </Box>
         </DialogContent>
         <DialogActions sx={{ p: 2, gap: 1 }}>
           <Button onClick={closeHangoutDialog}>Cancel</Button>
           <Button variant="contained" onClick={handleCreateHangout} disabled={!hangoutDatetime || (selectedFriendIds.length === 0 && !selectedGroupId)}>
           Create Hangout
           </Button>
         </DialogActions>
        </Dialog>

       </div>
       </div>
      );

    // Helper function to render a POI list item (must be inside component to access closure vars)
    function renderPoiItem(poi) {
      const privacyColor = getPoiBadgeColor(poi);
      const friendLabel = isFriendPoi(poi.id) ? formatFriendAssociationLabel(poi.id) : null;
      const placeIdeaContributors = getPlaceIdeaContributors(poi.id);

      return (
           <div
          key={poi.id}
          style={{
            padding: '10px',
            margin: '5px 0',
            border: '1px solid #ccc',
            borderRadius: '4px',
            backgroundColor: 'white',
            cursor: 'pointer',
            position: 'relative',
             }}
          onClick={() => {
            setSelectedMarker({ ...poi, position: poi.location?.location || poi.location });
            setMapCenter(poi.location);
             }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                <img
               src={getPoiIcon(poi)}
               alt=""
               style={{ width: 20, height: 20, flexShrink: 0 }}
                />
                <span style={{ fontWeight: 'bold', fontSize: '14px' }}>{poi.name}</span>
              </div>
              <div style={{
             backgroundColor: privacyColor,
             color: 'white',
             fontSize: '9px',
             padding: '2px 6px',
             borderRadius: '3px',
             marginLeft: '8px',
              }}>
                {getPoiBadgeLabel(poi)}
              </div>
            </div>
            {poi.location?.address && (
              <div style={{ fontSize: '12px', color: '#666', margin: '4px 0 0 28px' }}>
                {poi.location.address}
              </div>
            )}
            {friendLabel && (
              <div style={{ fontSize: '11px', color: '#fbc02d', margin: '4px 0 0 28px' }}>
                {friendLabel}
              </div>
            )}
            {placeIdeaContributors && placeIdeaContributors.length > 0 && (
              <div style={{ fontSize: '11px', color: '#666', margin: '2px 0 0 28px' }}>
               Suggested by: {placeIdeaContributors.join(', ')}
              </div>
            )}
            <div style={{ display: 'flex', gap: '5px', marginTop: '8px', flexWrap: 'wrap' }}>
              <button
             onClick={(e) => {
               e.stopPropagation();
               startEditingPoiInfo(poi);
                }}
             style={{
               padding: '3px 6px',
               fontSize: '10px',
               border: '1px solid #4285f4',
               borderRadius: '3px',
               backgroundColor: 'white',
               color: '#4285f4',
               cursor: 'pointer'
                }}
              >
             Edit Info
              </button>
              <button
             onClick={(e) => {
               e.stopPropagation();
               startEditingPoiPrivacy(poi);
                }}
             style={{
               padding: '3px 6px',
               fontSize: '10px',
               border: `1px solid ${privacyColor}`,
               borderRadius: '3px',
               backgroundColor: privacyColor,
               color: 'white',
               cursor: 'pointer'
                }}
              >
             Privacy Settings
              </button>
              <button
             onClick={(e) => {
               e.stopPropagation();
               openPlaceIdeasPicker(poi);
                }}
             style={{
               padding: '3px 6px',
               fontSize: '10px',
               border: '1px solid #2196f3',
               borderRadius: '3px',
               backgroundColor: '#e3f2fd',
               color: '#1565c0',
               cursor: 'pointer'
                }}
              >
               + Place Ideas
              </button>
               <button
              onClick={(e) => {
                e.stopPropagation();
                setDeleteConfirm(poi);
                  }}
             style={{
               padding: '3px 6px',
               fontSize: '10px',
               border: '1px solid #ff4444',
               borderRadius: '3px',
               backgroundColor: 'white',
               color: '#ff4444',
               cursor: 'pointer'
                }}
              >
             Delete
              </button>
            </div>
          </div>
        );
      }
  }

export default MasterMap;
