import React, { useState, useRef, useEffect } from "react";
import { GoogleMap, Marker, InfoWindow, Autocomplete } from "@react-google-maps/api";
import { auth, db } from "../firebaseConfig";
import { collection, doc, deleteDoc, updateDoc, getDocs } from 'firebase/firestore';
import { toast } from 'react-toastify';

import {
  createPoiFromPlaceResult,
  createPoiFromCoordinates,
} from "../lib/poiService";

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

function MasterMap() {
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [mapCenter, setMapCenter] = useState(DEFAULT_CENTER);
  const [userLocationLoaded, setUserLocationLoaded] = useState(false);
  const [allUserPOIs, setAllUserPOIs] = useState([]); // all POIs for this user (master view shows everything)
  const [loadingPOIs, setLoadingPOIs] = useState(false);
  const [editingPoi, setEditingPoi] = useState(null);
  const [editingPoiName, setEditingPoiName] = useState("");
  const [editingPoiNotes, setEditingPoiNotes] = useState("");
  const [privacyEditor, setPrivacyEditor] = useState(null);
  const [privacyForm, setPrivacyForm] = useState({ access: 'public', scope: 'all', allowedMapIds: [] });
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [userMaps, setUserMaps] = useState([]);
  const [poiCountsByMap, setPoiCountsByMap] = useState({}); // { mapId: count }
  const autocompleteRef = useRef(null);
  const mapRef = useRef(null);
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
          access: 'public',  // Master Map forces public
          scope: 'all',       // Master Map forces all maps
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
          access: 'public',  // Master Map forces public
          scope: 'all',       // Master Map forces all maps
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

   // Handle POI delete confirmation
  const handleDeletePoi = async (poi) => {
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'poi', poi.id));
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

      setAllUserPOIs(prev => prev.map(p =>
        p.id === editingPoi.id ? { ...p, name: editingPoiName, notes: editingPoiNotes } : p
       ));

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

   // Get the Google Maps icon URL for a POI based on its visibility settings
  const getPoiIcon = (poi) => {
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

  if (!user) return <div>Please sign in to view and edit maps.</div>;

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

             {!loadingPOIs && allUserPOIs.map(poi => {
             const privacyColor = getPoiBadgeColor(poi);
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
                 {selectedMarker.address && (
                   <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#666' }}>
                     &shy; {selectedMarker.address}
                   </p>
                 )}
                 {selectedMarker.notes && (
                   <p style={{ margin: '0 0 8px 0', fontSize: '14px' }}>
                     &bull; {selectedMarker.notes}
                   </p>
                 )}
                 {selectedMarker.location?.address && (
                   <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#666' }}>
                     &shy; {selectedMarker.location.address}
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
       </div>
     </div>
   );
}

export default MasterMap;