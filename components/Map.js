import React, { useState, useRef, useCallback, useEffect } from "react";
import { GoogleMap, Marker, InfoWindow, Autocomplete } from "@react-google-maps/api";
import { auth, db } from "../firebaseConfig";
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot, writeBatch } from 'firebase/firestore';
import MapInvitation from "./MapInvitation";
import { toast } from 'react-toastify';

import {
  createPoiFromPlaceResult,
  createPoiFromCoordinates,
} from "../lib/poiService";

const containerStyle = {
  width: "100%",
  height: "calc(100vh - 60px)" // Account for navbar
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


function Map({ mapId }) {
  const [shareEmail, setShareEmail] = useState("");
  const [shareLoading, setShareLoading] = useState(false);
  const [markers, setMarkers] = useState([]);
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [editingMarker, setEditingMarker] = useState(null);
  const [markerNotes, setMarkerNotes] = useState("");
  const [markerName, setMarkerName] = useState("");
  const [showMarkersList, setShowMarkersList] = useState(true);
  const [creatingMarker, setCreatingMarker] = useState(false);
  const [mapCenter, setMapCenter] = useState(DEFAULT_CENTER);
  const [loading, setLoading] = useState(true);
  const [showInvitation, setShowInvitation] = useState(false);
  const [accessStatus, setAccessStatus] = useState(null);
  const [mapInfo, setMapInfo] = useState(null);
  const [userLocationLoaded, setUserLocationLoaded] = useState(false);
  const [poiMarkers, setPoiMarkers] = useState([]);
  const [loadingPOIs, setLoadingPOIs] = useState(false);
  const [editingPoi, setEditingPoi] = useState(null);
  const [editingPoiName, setEditingPoiName] = useState("");
  const [editingPoiNotes, setEditingPoiNotes] = useState("");
  const [privacyEditor, setPrivacyEditor] = useState(null);
  const [privacyForm, setPrivacyForm] = useState({ access: 'private', scope: 'selective', allowedMapIds: [] });
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [userMaps, setUserMaps] = useState([]);
  const autocompleteRef = useRef(null);
  const mapRef = useRef(null);
  const updateTimeoutRef = useRef(null);
  const [user, setUser] = useState(auth.currentUser);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((loggedInUser) => {
      setUser(loggedInUser);
    });
    return () => unsubscribe();
   }, []);

   // Log API key availability for debugging
  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    console.log("Map.js - API Key:", apiKey ? "Found" : "Missing");
   }, []);

   // Get user's location
  useEffect(() => {
    if (!userLocationLoaded && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
         (position) => {
          const userLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
           };
          setMapCenter(userLocation);
          setUserLocationLoaded(true);
         },
         () => setUserLocationLoaded(true),
         { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
       );
     } else {
      setUserLocationLoaded(true);
     }
   }, [userLocationLoaded]);

   // Check access & load map info
  useEffect(() => {
    const checkAccess = async () => {
      if (!user || !mapId) return setLoading(false);

      try {
        const snapshot = await getDoc(doc(db, 'maps', mapId));
        if (!snapshot.exists()) return setLoading(false);

        const mapData = snapshot.data();
        setMapInfo(mapData);
        const isOwner = mapData.owner === user.uid;
        const collaboratorStatus = mapData.collaborators?.[user.uid]?.status;

        if (isOwner) setAccessStatus('owner');
        else if (collaboratorStatus === 'accepted') setAccessStatus('accepted');
        else if (collaboratorStatus === 'declined') setAccessStatus('declined');
        else {
          setAccessStatus('pending');
          setShowInvitation(true);
         }
       } catch (err) {
        console.error(err);
        setLoading(false);
       }
     };
    checkAccess();
   }, [user, mapId]);

   // Load markers from the current map's subcollection
  useEffect(() => {
    if (!mapId || !user) return setLoading(false);

    const unsubscribe = onSnapshot(collection(db, 'maps', mapId, 'markers'), (snapshot) => {
      setMarkers(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })));
      setLoading(false);
     }, (err) => {
      console.error(err);
      setLoading(false);
     });

    return () => unsubscribe();
   }, [mapId, user]);

   // Load user's maps for privacy scope selection
  useEffect(() => {
    if (!user || !mapId) return;

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
   }, [user, mapId]);

   // Load POIs from user's POI collection with visibility filtering
  useEffect(() => {
    if (!user || !mapId) return;

    let cancelled = false;
    setLoadingPOIs(true);

    const loadPOIs = async () => {
      try {
        const poiSnapshot = await getDocs(collection(db, 'users', user.uid, 'poi'));

        if (cancelled) return;

         // Filter POIs based on visibility rules:
         // - Public POIs (access === 'public') are always visible
         // - Selective POIs (scope === 'selective') are visible only if mapId is in allowedMapIds
        const visiblePOIs = poiSnapshot.docs
           .map(docSnap => ({ ...docSnap.data(), id: docSnap.id }))
           .filter(poi => {
            const visibility = poi.visibility || {};
            const access = visibility.access || 'private';
            const scope = visibility.scope || 'selective';

             // Public + All: visible everywhere
            if (access === 'public' && scope === 'all') return true;
             // Public + Selective: only if this mapId is in allowedMapIds
            if (access === 'public' && scope === 'selective') {
              return Array.isArray(visibility.allowedMapIds) && visibility.allowedMapIds.includes(mapId);
             }
             // Private + All: visible on any map owned by this user
            if (access === 'private' && scope === 'all') return true;
             // Private + Selective: only if this mapId is in allowedMapIds
            if (access === 'private' && scope === 'selective') {
              return Array.isArray(visibility.allowedMapIds) && visibility.allowedMapIds.includes(mapId);
             }

            return false;
           });

        setPoiMarkers(visiblePOIs);
       } catch (err) {
        console.error("Failed to load POIs:", err);
       } finally {
        if (!cancelled) setLoadingPOIs(false);
       }
     };

    loadPOIs();

    return () => { cancelled = true; };
   }, [user, mapId]);

   // Handle autocomplete place selection
  const onPlaceChanged = async () => {
    if (!user) return alert("Please sign in to save places");
    const place = autocompleteRef.current?.getPlace();
    if (!place?.geometry?.location) return;

     // Get the best name for the place
    const placeName = place.name ||
      place.formatted_address?.split(',')[0] ||
       "Unknown Location";

    const newMarker = {
      position: { lat: place.geometry.location.lat(), lng: place.geometry.location.lng() },
      name: placeName,
      address: place.formatted_address || "",
      types: place.types || [],
      placeId: place.place_id,
      notes: "",
      createdAt: Date.now()
     };

    try {
      const newMarkerRef = doc(collection(db, 'maps', mapId, 'markers'));
      await setDoc(newMarkerRef, newMarker);
      const markerWithId = { ...newMarker, id: newMarkerRef.id };
      setSelectedMarker(markerWithId);
      setMapCenter(newMarker.position);

      const input = document.querySelector('input[placeholder="Search for a place..."]');
      if (input) input.value = '';

      console.log("Place marker created:", markerWithId);
     } catch (err) {
      console.error(err);
      alert("Error saving location. Please try again.");
     }

     // Create POI separately so it doesn't block marker creation
    if (user && user.uid) {
      try {
        console.log("Creating POI for userId:", user?.uid, "email:", user?.email);
        const newPoi = await createPoiFromPlaceResult({
          userId: user.uid,
          place,
          visibility: {
            access: 'private',
            scope: 'selective',
            allowedMapIds: [mapId],
           },
         });
        console.log("POI created successfully");
         // Immediately add POI to local state so icon appears right away
        if (newPoi) {
          setPoiMarkers(prev => [...prev, { ...newPoi, id: newPoi.id }]);
         }
       } catch (poiErr) {
        console.error("Failed to create POI (marker still saved):", poiErr);
       }
     }
   };

   // Handle map click to add markers
  const onMapClick = async (event) => {
    if (!user) return alert("Please sign in to save places");
    if (creatingMarker) return;

    if (selectedMarker) {
      setSelectedMarker(null);
      return;
     }

    const lat = event.latLng.lat();
    const lng = event.latLng.lng();

    setCreatingMarker(true);
    console.log("Looking up address for coordinates:", lat, lng);

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
      component => component.types.includes('establishment') ||
        component.types.includes('point_of_interest')
     );

    if (establishmentComponent) {
      name = establishmentComponent.long_name;
     } else {
      const streetNumber = place.address_components?.find(
        component => component.types.includes('street_number')
       )?.long_name;

      const route = place.address_components?.find(
        component => component.types.includes('route')
       )?.long_name;

      if (streetNumber && route) {
        name = `${streetNumber} ${route}`;
       } else if (route) {
        name = route;
       } else {
        name = place.address_components?.[0]?.long_name ||
          place.formatted_address?.split(',')[0] ||
           "Unknown Location";
       }
     }

    const newMarker = {
      position: { lat, lng },
      name: name,
      address: place.formatted_address || "",
      types: place.types || [],
      placeId: place.place_id || null,
      notes: "",
      createdAt: Date.now()
     };

     // Save to Firestore
    const newMarkerRef = doc(collection(db, 'maps', mapId, 'markers'));
    await setDoc(newMarkerRef, newMarker);

     // Update local state and select the new marker
    const markerWithId = { ...newMarker, id: newMarkerRef.id };
    setSelectedMarker(markerWithId);
    setMapCenter(newMarker.position);

    console.log("Marker created:", markerWithId);
    toast.success(`Added marker: ${name}`);

     // Create POI separately so it doesn't block marker creation
    if (user && user.uid) {
      try {
        console.log("Creating POI for userId:", user?.uid, "email:", user?.email);
        const newPoi = await createPoiFromCoordinates({
          userId: user.uid,
          lat,
          lng,
          visibility: {
            access: 'private',
            scope: 'selective',
            allowedMapIds: [mapId],
           },
         });
        console.log("POI created successfully");
         // Immediately add POI to local state so icon appears right away
        if (newPoi) {
          setPoiMarkers(prev => [...prev, { ...newPoi, id: newPoi.id }]);
         }
       } catch (poiErr) {
        console.error("Failed to create POI (marker still saved):", poiErr);
       }
     }

    setCreatingMarker(false);
   };

   // Handle marker editing
  const startEditingMarker = (marker) => {
    setEditingMarker(marker);
    setMarkerName(marker.name || "");
    setMarkerNotes(marker.notes || "");
   };

  const saveMarkerEdit = async () => {
    if (!editingMarker) return;

    try {
      const markerRef = doc(db, 'maps', mapId, 'markers', editingMarker.id);
      await updateDoc(markerRef, {
        name: markerName,
        notes: markerNotes
       });

       // Update local state
      setMarkers(prev => prev.map(marker =>
        marker.id === editingMarker.id
           ? { ...marker, name: markerName, notes: markerNotes }
           : marker
       ));

       // Update selected marker if it's the one being edited
      if (selectedMarker?.id === editingMarker.id) {
        setSelectedMarker({ ...selectedMarker, name: markerName, notes: markerNotes });
       }

      setEditingMarker(null);
      setMarkerName("");
      setMarkerNotes("");
      toast.success("Marker updated successfully!");
     } catch (err) {
      console.error("Error updating marker:", err);
      toast.error("Error updating marker. Please try again.");
     }
   };

  const cancelEditingMarker = () => {
    setEditingMarker(null);
    setMarkerName("");
    setMarkerNotes("");
   };

  const deleteMarker = async (markerId) => {
    if (!confirm("Are you sure you want to delete this marker?")) return;

    try {
      await deleteDoc(doc(db, 'maps', mapId, 'markers', markerId));
      setMarkers(prev => prev.filter(marker => marker.id !== markerId));
      if (selectedMarker?.id === markerId) {
        setSelectedMarker(null);
       }
      toast.success("Marker deleted successfully!");
     } catch (err) {
      console.error("Error deleting marker:", err);
      toast.error("Error deleting marker. Please try again.");
     }
   };

  const handleMarkerClick = (marker) => {
    if (selectedMarker?.id === marker.id) {
      setSelectedMarker(null);
     } else {
      setSelectedMarker(marker);
     }
   };

   // Handle inviting someone to the map
  const handleInvite = async () => {
    if (!shareEmail.trim()) {
      alert("Please enter an email address");
      return;
     }

    setShareLoading(true);
    try {
      const response = await fetch('/api/email/invite', {
        method: 'POST',
        headers: {
           'Content-Type': 'application/json',
         },
        body: JSON.stringify({
          mapId,
          senderName: user.displayName,
          senderEmail: user.email,
          recipientEmail: shareEmail,
          mapName: mapInfo?.name || 'Untitled Map'
         }),
       });

      if (response.ok) {
        alert("Invitation sent successfully!");
        setShareEmail("");
       } else {
        const errorData = await response.json();
        alert(`Failed to send invitation: ${errorData.error || 'Please try again.'}`);
       }
     } catch (error) {
      console.error("Error sending invitation:", error);
      alert("Error sending invitation. Please try again.");
     } finally {
      setShareLoading(false);
     }
   };

   // POI-specific handler functions

   // Start editing POI info
  const startEditingPoiInfo = (poi) => {
    setEditingPoi(poi);
    setEditingPoiName(poi.name || "");
    setEditingPoiNotes(poi.notes || "");
   };

   // Save POI info edit
  const savePoiInfoEdit = async () => {
    if (!editingPoi) return;

    try {
      const poiRef = doc(db, 'users', user.uid, 'poi', editingPoi.id);
      await updateDoc(poiRef, {
        name: editingPoiName,
        notes: editingPoiNotes
       });

       // Update local state
      setPoiMarkers(prev => prev.map(poi =>
        poi.id === editingPoi.id
           ? { ...poi, name: editingPoiName, notes: editingPoiNotes }
           : poi
       ));

       // Update selected marker if it's the one being edited
      if (selectedMarker?.id === editingPoi.id) {
        setSelectedMarker({ ...selectedMarker, name: editingPoiName, notes: editingPoiNotes });
       }

      setEditingPoi(null);
      setEditingPoiName("");
      setEditingPoiNotes("");
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
   };

   // Start editing POI privacy settings
  const startEditingPoiPrivacy = (poi) => {
    const visibility = poi.visibility || {};
    setPrivacyEditor(poi);
    setPrivacyForm({
      access: visibility.access || 'private',
      scope: visibility.scope || 'selective',
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

       // Update local state
      const updatedPoi = {
         ...privacyEditor,
        visibility: {
          access: privacyForm.access,
          scope: privacyForm.scope,
          allowedMapIds: privacyForm.allowedMapIds
         }
       };

      setPoiMarkers(prev => prev.map(poi =>
        poi.id === privacyEditor.id ? updatedPoi : poi
       ));

       // Update selected marker if it's the one being edited
      if (selectedMarker?.id === privacyEditor.id) {
        setSelectedMarker(updatedPoi);
       }

      setPrivacyEditor(null);
      setPrivacyForm({ access: 'private', scope: 'selective', allowedMapIds: [] });
      toast.success("POI privacy settings updated successfully!");
     } catch (err) {
      console.error("Error updating POI privacy:", err);
      toast.error("Error updating privacy settings. Please try again.");
     }
   };

  const cancelPoiPrivacyEdit = () => {
    setPrivacyEditor(null);
    setPrivacyForm({ access: 'private', scope: 'selective', allowedMapIds: [] });
   };

   // Handle POI delete confirmation
  const handleDeletePoi = async (poi) => {
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'poi', poi.id));

       // Update local state
      setPoiMarkers(prev => prev.filter(p => p.id !== poi.id));

       // Clear selected marker if it's the deleted POI
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

  const cancelDeletePoi = () => {
    setDeleteConfirm(null);
   };

   // Get the Google Maps icon URL for a POI based on its visibility settings
  const getPoiIcon = (poi) => {
    const visibility = poi.visibility || {};
    const access = visibility.access || 'private';
    const scope = visibility.scope || 'selective';
    return POI_ICONS[`${access}-${scope}`] || DEFAULT_POI_ICON;
   };

   // Get the label text for a POI's visibility badge
  const getPoiBadgeLabel = (poi) => {
    const visibility = poi.visibility || {};
    const access = visibility.access || 'private';
    const scope = visibility.scope || 'selective';
    if (access === 'public' && scope === 'all') return 'Public All';
    if (access === 'public' && scope === 'selective') return 'Public Selective';
    if (access === 'private' && scope === 'all') return 'Private All';
    if (access === 'private' && scope === 'selective') return 'Private Selective';
    return 'Private Selective';
   };

   // Color for the visibility badge
  const getPoiBadgeColor = (poi) => {
    const visibility = poi.visibility || {};
    const access = visibility.access || 'private';
    const scope = visibility.scope || 'selective';
    const colors = {
       'private-selective': '#ff9800', // orange
       'private-all': '#9c27b0', // purple
       'public-selective': '#e91e8c', // pink
       'public-all': '#4caf50', // green
     };
    return colors[`${access}-${scope}`] || '#757575';
   };

  if (!user) return <div>Please sign in to view and edit maps.</div>;
  if (showInvitation) return <MapInvitation mapId={mapId} onResponse={(res) => { setShowInvitation(false); setAccessStatus(res); }} />;
  if (accessStatus === 'declined') return (
     <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column', gap: '1rem' }}>
       <p>You have declined this map invitation.</p>
       <button onClick={() => { setAccessStatus('pending'); setShowInvitation(true); }} style={{ padding: '8px 16px', background: '#4285f4', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Accept Invitation</button>
     </div>
   );
  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontSize: '18px', color: '#666' }}>Loading map...</div>;

  return (
     <div style={{ display: 'flex', height: '100%' }}>
       {/* Left Sidebar */}
       <div style={{
        width: '350px',
        padding: '20px',
        borderRight: '1px solid #ddd',
        overflowY: 'auto',
        backgroundColor: '#f9f9f9'
       }}>
         {/* Invite section */}
         <div style={{
          marginBottom: '20px',
          padding: '15px',
          border: '1px solid #ddd',
          borderRadius: '8px',
          backgroundColor: 'white'
         }}>
           <h3 style={{ margin: '0 0 10px 0', fontSize: '16px' }}>Invite Someone</h3>
           <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
             <input
              type="email"
              value={shareEmail}
              onChange={(e) => setShareEmail(e.target.value)}
              placeholder="Enter email address..."
              style={{
                flex: 1,
                padding: '8px',
                fontSize: '14px',
                border: '1px solid #ccc',
                borderRadius: '4px'
               }}
             />
             <button
              onClick={handleInvite}
              disabled={shareLoading}
              style={{
                padding: '8px 16px',
                backgroundColor: '#4285f4',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: shareLoading ? 'not-allowed' : 'pointer',
                fontSize: '14px'
               }}
             >
               {shareLoading ? 'Sending...' : 'Send'}
             </button>
           </div>
         </div>

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
             {creatingMarker ?
               "🔍 Looking up address..." :
               "Or click on the map to add a marker"
             }
           </p>
         </div>

         {/* Markers List */}
         <div>
           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
             <h3 style={{ margin: 0, fontSize: '16px' }}>Map Markers ({markers.length})</h3>
             <button
              onClick={() => setShowMarkersList(!showMarkersList)}
              style={{
                padding: '4px 8px',
                fontSize: '12px',
                border: '1px solid #ccc',
                borderRadius: '4px',
                backgroundColor: 'white',
                cursor: 'pointer'
               }}
             >
               {showMarkersList ? 'Hide' : 'Show'}
             </button>
           </div>

           {showMarkersList && (
             <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
               {markers.map(marker => (
                 <div
                  key={marker.id}
                  style={{
                    padding: '10px',
                    margin: '5px 0',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    backgroundColor: selectedMarker?.id === marker.id ? '#e3f2fd' : 'white',
                    cursor: 'pointer'
                   }}
                  onClick={() => handleMarkerClick(marker)}
                 >
                   <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{marker.name}</div>
                   {marker.address && (
                     <div style={{ fontSize: '12px', color: '#666', margin: '2px 0' }}>
                       {marker.address}
                     </div>
                   )}
                   {marker.notes && (
                     <div style={{ fontSize: '12px', fontStyle: 'italic', margin: '2px 0' }}>
                       "{marker.notes}"
                     </div>
                   )}
                   <div style={{ display: 'flex', gap: '5px', marginTop: '5px' }}>
                     <button
                      onClick={(e) => {
                        e.stopPropagation();
                        startEditingMarker(marker);
                       }}
                      style={{
                        padding: '2px 6px',
                        fontSize: '10px',
                        border: '1px solid #4285f4',
                        borderRadius: '3px',
                        backgroundColor: 'white',
                        color: '#4285f4',
                        cursor: 'pointer'
                       }}
                     >
                      Edit
                     </button>
                     <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteMarker(marker.id);
                       }}
                      style={{
                        padding: '2px 6px',
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
               ))}
               {markers.length === 0 && (
                 <p style={{ textAlign: 'center', color: '#666', fontStyle: 'italic' }}>
                  No markers yet. Search for a place or click on the map to add one.
                 </p>
               )}
             </div>
           )}
         </div>

         {/* POIs List */}
         <div style={{ marginTop: '20px' }}>
           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
             <h3 style={{ margin: 0, fontSize: '16px' }}>
              POIs ({poiMarkers.length})
             </h3>
             {loadingPOIs && (
               <span style={{ fontSize: '12px', color: '#666' }}>Loading...</span>
             )}
           </div>

           {!loadingPOIs && poiMarkers.map(poi => {
            const privacyColor = getPoiBadgeColor(poi);
            return (
               <div
                key={poi.id}
                style={{
                  padding: '10px',
                  margin: '5px 0',
                  border: '1px solid #ccc', // CHANGED: grey outline instead of privacyColor
                  borderRadius: '4px',
                  backgroundColor: 'white',
                  cursor: 'pointer',
                  position: 'relative',
                 }}
                onClick={() => {
                  const poiMarker = { ...poi, position: poi.location?.location || poi.location };
                  setSelectedMarker(poiMarker);
                  setMapCenter(poiMarker.position);
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
                   {/* Visibility badge in upper right */}
                   <div
                    style={{
                      backgroundColor: privacyColor,
                      color: 'white',
                      fontSize: '9px',
                      padding: '2px 6px',
                      borderRadius: '3px',
                      marginLeft: '8px',
                     }}
                   >
                     {getPoiBadgeLabel(poi)}
                   </div>
                 </div>
                 {poi.location?.address && (
                   <div style={{ fontSize: '12px', color: '#666', margin: '4px 0 0 28px' }}>
                     {poi.location.address}
                   </div>
                 )}
                 {/* Action buttons for POI */}
                 <div style={{ display: 'flex', gap: '5px', marginTop: '8px', flexWrap: 'wrap' }}>
                   <button
                    onClick={(e) => {
                      e.stopPropagation();
                      startEditingPoiInfo(poi);
                     }}
                    style={{
                      padding: '3px 6px',
                      fontSize: '10px',
                      border: '1px solid #4285f4', // CHANGED: blue instead of privacyColor
                      borderRadius: '3px',
                      backgroundColor: 'white',
                      color: '#4285f4', // CHANGED: blue text instead of privacyColor
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
           })}

           {!loadingPOIs && poiMarkers.length === 0 && (
             <p style={{ textAlign: 'center', color: '#666', fontStyle: 'italic', fontSize: '12px' }}>
              No POIs yet. Create a location to get started.
             </p>
           )}
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
           {/* Map markers from "markers" collection are hidden - using POI markers as source of truth */}
           {/* POI markers (from user's POI collection with visibility filtering) */}
           {poiMarkers.map(poi => (
             <Marker
              key={`poi-${poi.id}`}
              position={poi.location?.location || poi.location}
              icon={getPoiIcon(poi)}
              onClick={() => setSelectedMarker({ ...poi, position: poi.location?.location || poi.location })}
             />
           ))}

           {/* InfoWindow for either marker type */}
           {selectedMarker && (
             <InfoWindow
              position={selectedMarker.position}
              onCloseClick={() => setSelectedMarker(null)}
             >
               <div style={{ maxWidth: 300 }}>
                 <h4 style={{ margin: '0 0 8px 0', fontSize: '16px' }}>{selectedMarker.name}</h4>
                 {selectedMarker.address && (
                   <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#666' }}>
                     📍 {selectedMarker.address}
                   </p>
                 )}
                 {selectedMarker.notes && (
                   <p style={{ margin: '0 0 8px 0', fontSize: '14px' }}>
                     📝 {selectedMarker.notes}
                   </p>
                 )}
                 {selectedMarker.location?.address && (
                   <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#666' }}>
                     📍 {selectedMarker.location.address}
                   </p>
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
                        border: '1px solid #4285f4', // CHANGED: blue instead of privacyColor
                        borderRadius: '4px',
                        backgroundColor: 'white',
                        color: '#4285f4', // CHANGED: blue text instead of privacyColor
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
            minWidth: '300px'
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
                 <div style={{ maxHeight: '150px', overflowY: 'auto', border: '1px solid #ccc', borderRadius: '4px', padding: '8px' }}>
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
                       <label htmlFor={`map-${userMap.id}`} style={{ marginLeft: '8px', fontSize: '14px' }}>
                         {userMap.name || 'Untitled Map'}
                       </label>
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
           {deleteConfirm && ( // CHANGED: removed deleteConfirm.visibility && requirement
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
                      <strong>Privacy State:</strong>{' '}
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
                    </div>
                   )}
                 </div>
               </div>

               <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                 <button
                  onClick={cancelDeletePoi}
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
         </div>
       </div>
     );
}

export default Map;