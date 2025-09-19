import React, { useState, useRef, useCallback, useEffect } from "react";
import { GoogleMap, Marker, InfoWindow, Autocomplete } from "@react-google-maps/api";
import { auth, db } from "../firebaseConfig";
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot, writeBatch } from 'firebase/firestore';
import MapInvitation from "./MapInvitation";
import { toast } from 'react-toastify';

const containerStyle = {
  width: "100%",
  height: "700px"
};

const DEFAULT_CENTER = { lat: 37.7749, lng: -122.4194 };


function Map({ mapId }) {
  const [shareEmail, setShareEmail] = useState("");
  const [shareLoading, setShareLoading] = useState(false);
  const [markers, setMarkers] = useState([]);
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [mapCenter, setMapCenter] = useState(DEFAULT_CENTER);
  const [loading, setLoading] = useState(true);
  const [showInvitation, setShowInvitation] = useState(false);
  const [accessStatus, setAccessStatus] = useState(null);
  const [mapInfo, setMapInfo] = useState(null);
  const [userLocationLoaded, setUserLocationLoaded] = useState(false);
  const autocompleteRef = useRef(null);
  const mapRef = useRef(null);
  const updateTimeoutRef = useRef(null);
  const user = auth.currentUser;

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

  // Load markers
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

  // Handle autocomplete place selection
  const onPlaceChanged = async () => {
    if (!user) return alert("Please sign in to save places");
    const place = autocompleteRef.current?.getPlace();
    if (!place?.geometry?.location) return;

    const newMarker = {
      position: { lat: place.geometry.location.lat(), lng: place.geometry.location.lng() },
      name: place.name || place.formatted_address || "Unknown Location",
      address: place.formatted_address || "",
      types: place.types || [],
      placeId: place.place_id,
      notes: "",
      createdAt: Date.now()
    };

    try {
      const newMarkerRef = doc(collection(db, 'maps', mapId, 'markers'));
      await setDoc(newMarkerRef, newMarker);
      setSelectedMarker({ ...newMarker, id: newMarkerRef.id });
      setMapCenter(newMarker.position);

      const input = document.querySelector('input[placeholder="Search for a place..."]');
      if (input) input.value = '';
    } catch (err) {
      console.error(err);
      alert("Error saving location. Please try again.");
    }
  };

  // Handle map click to add markers
  const onMapClick = async (event) => {
    if (!user) return alert("Please sign in to save places");
    
    const newMarker = {
      position: { lat: event.latLng.lat(), lng: event.latLng.lng() },
      name: "New Location",
      address: "",
      types: [],
      placeId: null,
      notes: "",
      createdAt: Date.now()
    };

    try {
      const newMarkerRef = doc(collection(db, 'maps', mapId, 'markers'));
      await setDoc(newMarkerRef, newMarker);
      setSelectedMarker({ ...newMarker, id: newMarkerRef.id });
      setMapCenter(newMarker.position);
    } catch (err) {
      console.error(err);
      alert("Error saving location. Please try again.");
    }
  };

  if (!user) return <div>Please sign in to view and edit maps.</div>;
  if (showInvitation) return <MapInvitation mapId={mapId} onResponse={(res) => { setShowInvitation(false); setAccessStatus(res); }} />;
  if (accessStatus === 'declined') return (
    <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:'100vh', flexDirection:'column', gap:'1rem' }}>
      <p>You have declined this map invitation.</p>
      <button onClick={() => { setAccessStatus('pending'); setShowInvitation(true); }} style={{ padding:'8px 16px', background:'#4285f4', color:'white', border:'none', borderRadius:'4px', cursor:'pointer' }}>Accept Invitation</button>
    </div>
  );
  if (loading) return <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:'100vh', fontSize:'18px', color:'#666' }}>Loading map...</div>;

  return (
    <div>
      {/* Search input */}
      <div style={{ marginBottom: '10px' }}>
        <Autocomplete
          onLoad={autocomplete => autocompleteRef.current = autocomplete}
          onPlaceChanged={onPlaceChanged}
        >
          <input
            type="text"
            placeholder="Search for a place..."
            style={{
              width: '300px',
              padding: '8px',
              fontSize: '14px',
              border: '1px solid #ccc',
              borderRadius: '4px'
            }}
          />
        </Autocomplete>
      </div>
      
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={mapCenter}
        zoom={10}
        onClick={onMapClick}
        onLoad={map => mapRef.current = map}
      >
        {markers.map(marker => (
          <Marker 
            key={marker.id} 
            position={marker.position} 
            onClick={() => setSelectedMarker(selectedMarker?.id === marker.id ? null : marker)} 
          />
        ))}
        {selectedMarker && (
          <InfoWindow position={selectedMarker.position} onCloseClick={() => setSelectedMarker(null)}>
            <div style={{ maxWidth: 250 }}>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '14px' }}>{selectedMarker.name}</h4>
              <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#666' }}>{selectedMarker.address}</p>
            </div>
          </InfoWindow>
        )}
      </GoogleMap>
    </div>
  );
}

export default Map;
