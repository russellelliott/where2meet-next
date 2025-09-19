import React, { useState, useRef, useCallback, useEffect } from "react";
import { GoogleMap, Marker, InfoWindow, Autocomplete } from "@react-google-maps/api";
import { auth, db } from "../firebaseConfig";
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot, writeBatch } from 'firebase/firestore';
import MapInvitation from "./MapInvitation";
import { toast } from 'react-toastify';

const containerStyle = {
  width: "100%",
  height: "calc(100vh - 60px)" // Account for navbar
};

const DEFAULT_CENTER = { lat: 37.7749, lng: -122.4194 };


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
  };

  // Handle map click to add markers
  const onMapClick = async (event) => {
    if (!user) return alert("Please sign in to save places");
    if (creatingMarker) return; // Prevent multiple clicks while processing
    
    // If there's a selected marker (InfoWindow open), close it instead of creating new marker
    if (selectedMarker) {
      setSelectedMarker(null);
      return;
    }
    
    const lat = event.latLng.lat();
    const lng = event.latLng.lng();
    
    setCreatingMarker(true);
    console.log("Looking up address for coordinates:", lat, lng);
    
    try {
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
      
      // Extract place information from geocoding result with better name prioritization
      const place = geocodeResult;
      
      // Try to get the best name for the location
      let name = "Unknown Location";
      
      // Priority 1: If it's a business/POI, use the establishment name
      const establishmentComponent = place.address_components?.find(
        component => component.types.includes('establishment') || 
                    component.types.includes('point_of_interest')
      );
      
      if (establishmentComponent) {
        name = establishmentComponent.long_name;
      } 
      // Priority 2: Use street number + route for addresses
      else {
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
        }
        // Priority 3: Use first component or formatted address first part
        else {
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
    } catch (err) {
      console.error("Error creating marker:", err);
      
      // Fallback: create marker with basic info if geocoding fails
      const fallbackMarker = {
        position: { lat, lng },
        name: "Dropped Pin",
        address: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
        types: [],
        placeId: null,
        notes: "",
        createdAt: Date.now()
      };

      try {
        const newMarkerRef = doc(collection(db, 'maps', mapId, 'markers'));
        await setDoc(newMarkerRef, fallbackMarker);
        const markerWithId = { ...fallbackMarker, id: newMarkerRef.id };
        setSelectedMarker(markerWithId);
        setMapCenter(fallbackMarker.position);
        toast.success("Added marker at coordinates");
      } catch (saveErr) {
        console.error("Error saving fallback marker:", saveErr);
        toast.error("Error saving location. Please try again.");
      }
    } finally {
      setCreatingMarker(false);
    }
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
            <h3 style={{ margin: 0, fontSize: '16px' }}>Markers ({markers.length})</h3>
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
          {markers.map(marker => (
            <Marker 
              key={marker.id} 
              position={marker.position} 
              onClick={() => handleMarkerClick(marker)} 
            />
          ))}
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
                <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                  <button
                    onClick={() => startEditingMarker(selectedMarker)}
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
                    Edit
                  </button>
                  <button
                    onClick={() => deleteMarker(selectedMarker.id)}
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
              </div>
            </InfoWindow>
          )}
        </GoogleMap>

        {/* Editing Modal */}
        {editingMarker && (
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
            <h3 style={{ margin: '0 0 15px 0', fontSize: '18px' }}>Edit Marker</h3>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: 'bold' }}>
                Name:
              </label>
              <input
                type="text"
                value={markerName}
                onChange={(e) => setMarkerName(e.target.value)}
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
                value={markerNotes}
                onChange={(e) => setMarkerNotes(e.target.value)}
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
                onClick={cancelEditingMarker}
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
                onClick={saveMarkerEdit}
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
      </div>
    </div>
  );
}

export default Map;
