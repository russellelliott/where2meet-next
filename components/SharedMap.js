

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/router";
import { auth, db } from "../firebaseConfig";
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot, query, where } from 'firebase/firestore';
import { GoogleMap, LoadScript, Marker, InfoWindow, Autocomplete } from "@react-google-maps/api";

const containerStyle = {
  width: "100%",
  height: "700px"
};
const DEFAULT_CENTER = { lat: 37.7749, lng: -122.4194 };
function getGoogleMapsKey() {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
}

function SharedMap() {
  const router = useRouter();
  const { mapId } = router.query;
  const [markers, setMarkers] = useState([]);
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [mapCenter, setMapCenter] = useState(DEFAULT_CENTER);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("pending");
  const [ownerName, setOwnerName] = useState("");
  const autocompleteRef = React.useRef(null);
  const mapRef = React.useRef(null);
  const user = auth.currentUser;

  useEffect(() => {
    if (!user) return;
    
    const fetchMapData = async () => {
      // Get access info for this map
      const mapDocRef = doc(db, 'maps', mapId);
      const snap = await getDoc(mapDocRef);
      
      if (snap.exists()) {
        const mapData = snap.data();
        // Check if user is owner or collaborator
        if (mapData.owner === user.uid || (mapData.collaborators && mapData.collaborators[user.uid])) {
          setStatus("accepted");
        }
        // Get owner's name
        const ownerProfileRef = doc(db, 'users', mapData.owner, 'profile', 'info');
        const ownerSnap = await getDoc(ownerProfileRef);
        if (ownerSnap.exists()) {
          setOwnerName(ownerSnap.data().displayName || "");
        }
      }
      setLoading(false);
    };

    fetchMapData().catch(error => {
      console.error('Error fetching map data:', error);
      setLoading(false);
    });
  }, [user, mapId]);

  useEffect(() => {
    if (status !== "accepted") return;
    // Listen to markers for this specific map
    const markersCollection = collection(db, 'maps', mapId, 'markers');
    const unsub = onSnapshot(markersCollection, (snapshot) => {
      const markersArray = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      }));
      setMarkers(markersArray);
    });

    // Get user's location if available
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const userLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          setMapCenter(userLocation);
        },
        (error) => {
          console.warn('Error getting user location:', error);
          // Keep default location if geolocation fails
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000 // 5 minutes
        }
      );
    }

    return () => unsub();
  }, [status, mapId]);

  // Add marker by clicking map
  const onMapClick = React.useCallback(async (event) => {
    if (status !== "accepted") return;
    const lat = event.latLng.lat();
    const lng = event.latLng.lng();
    // Geocode for address
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ location: { lat, lng } }, async (results, statusCode) => {
      let newMarker;
      const markerId = Date.now();
      if (statusCode === "OK" && results && results.length > 0) {
        const place = results[0];
        newMarker = {
          position: { lat, lng },
          name: place.formatted_address || "Dropped Pin",
          address: place.formatted_address || "",
          types: place.types || [],
          placeId: place.place_id,
          notes: "",
          createdAt: markerId
        };
      } else {
        newMarker = {
          position: { lat, lng },
          name: "Dropped Pin",
          address: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
          types: [],
          placeId: null,
          notes: "",
          createdAt: markerId
        };
      }
      try {
        const markersCollection = collection(db, 'maps', mapId, 'markers');
        const newMarkerRef = doc(markersCollection);
        await setDoc(newMarkerRef, newMarker);
        setSelectedMarker({ ...newMarker, id: newMarkerRef.id });
      } catch (error) {
        alert("Error saving marker. Try again.");
      }
    });
  }, [status, mapId]);

  // Update marker notes
  const updateMarkerNotes = async (markerId, notes) => {
    if (status !== "accepted") return;
    try {
      const markerRef = doc(db, 'maps', mapId, 'markers', markerId);
      await updateDoc(markerRef, { notes });
      if (selectedMarker && selectedMarker.id === markerId) {
        setSelectedMarker(prev => ({ ...prev, notes }));
      }
    } catch (error) {
      alert("Error updating notes. Try again.");
    }
  };

  // Remove a marker
  const removeMarker = async (markerId) => {
    if (status !== "accepted") return;
    try {
      const markerRef = ref(database, `users/${mapId}/markers/${markerId}`);
      await remove(markerRef);
      setSelectedMarker(null);
    } catch (error) {
      alert("Error removing marker. Try again.");
    }
  };

  // Clear all markers
  const clearAllMarkers = async () => {
    if (status !== "accepted") return;
    if (window.confirm("Are you sure you want to remove all saved places? This cannot be undone.")) {
      try {
        const markersRef = ref(database, `users/${mapId}/markers`);
        await remove(markersRef);
        setSelectedMarker(null);
      } catch (error) {
        alert("Error clearing locations. Try again.");
      }
    }
  };

  // Add marker by search
  const onPlaceChanged = async () => {
    if (status !== "accepted") return;
    const place = autocompleteRef.current.getPlace();
    if (place && place.geometry && place.geometry.location) {
      const newMarker = {
        position: {
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng()
        },
        name: place.name || place.formatted_address || "Unknown Location",
        address: place.formatted_address || "",
        types: place.types || [],
        placeId: place.place_id,
        notes: "",
        createdAt: Date.now()
      };
      try {
        const newMarkerRef = ref(database, `users/${mapId}/markers/${Date.now()}`);
        await set(newMarkerRef, newMarker);
        setSelectedMarker({ ...newMarker, id: newMarkerRef.key });
      } catch (error) {
        alert("Error saving marker. Try again.");
      }
    }
  };

  const handleAccept = async () => {
    if (!user) return;
    await set(ref(database, `sharedMaps/${mapId}/collaborators/${user.uid}`), {
      email: user.email,
      status: "accepted",
      acceptedAt: Date.now(),
    });
    setStatus("accepted");
  };

  const handleDecline = async () => {
    if (!user) return;
    await set(ref(database, `sharedMaps/${mapId}/collaborators/${user.uid}`), {
      email: user.email,
      status: "declined",
      declinedAt: Date.now(),
    });
    setStatus("declined");
  };

  if (!user) return <div style={{ padding: 40 }}>Please sign in to view this shared map.</div>;
  if (loading) return <div style={{ padding: 40 }}>Loading...</div>;

  return (
    <LoadScript googleMapsApiKey={getGoogleMapsKey()} libraries={["places"]}>
      <div style={{ position: "absolute", zIndex: 200, background: "#fff", padding: 15, left: 10, top: 70, borderRadius: 8, boxShadow: "0 2px 8px #0002", maxWidth: 350 }}>
        <h3 style={{ margin: "0 0 10px 0", fontSize: "16px" }}>Shared Map {ownerName && `from ${ownerName}`}</h3>
        {status === "pending" && (
          <div>
            <p>You have been invited to collaborate on this map.</p>
            <button onClick={handleAccept} style={{ marginRight: 10 }}>Accept</button>
            <button onClick={handleDecline}>Decline</button>
          </div>
        )}
        {status === "declined" && <div>You declined the invitation.</div>}
        {status === "accepted" && (
          <>
            <div style={{ marginBottom: 10 }}>
              <Autocomplete onLoad={ac => (autocompleteRef.current = ac)} onPlaceChanged={onPlaceChanged}>
                <input
                  type="text"
                  placeholder="Search for a place..."
                  style={{ width: "100%", padding: "8px", border: "1px solid #ccc", borderRadius: "4px", boxSizing: "border-box" }}
                />
              </Autocomplete>
            </div>
            <div style={{ fontSize: "12px", color: "#666", marginBottom: 10 }}>
              Click anywhere on the map to drop a pin
            </div>
            <div style={{ marginBottom: 10 }}>
              <strong>Saved Places ({markers.length}):</strong>
              {markers.length > 0 && (
                <button 
                  onClick={clearAllMarkers}
                  style={{
                    marginLeft: 10,
                    padding: "2px 6px",
                    fontSize: "10px",
                    background: "#ff4444",
                    color: "white",
                    border: "none",
                    borderRadius: "3px",
                    cursor: "pointer"
                  }}
                >
                  Clear All
                </button>
              )}
            </div>
            <div style={{ maxHeight: 200, overflowY: 'auto', fontSize: '12px', border: markers.length > 0 ? "1px solid #eee" : "none", borderRadius: "4px" }}>
              {markers.map((marker) => (
                <div 
                  key={marker.id} 
                  style={{ 
                    margin: '4px 0', 
                    cursor: 'pointer', 
                    padding: '6px', 
                    backgroundColor: selectedMarker?.id === marker.id ? '#e0e0e0' : 'transparent',
                    borderRadius: "3px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center"
                  }}
                  onClick={() => {
                    setSelectedMarker(selectedMarker?.id === marker.id ? null : marker);
                    setMapCenter(marker.position);
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: "bold" }}>{marker.name}</div>
                    <div style={{ color: "#666" }}>{marker.address}</div>
                    {marker.notes && (
                      <div style={{ color: "#888", fontSize: "10px", fontStyle: "italic", marginTop: "2px" }}>
                        📝 {marker.notes.length > 50 ? marker.notes.substring(0, 50) + "..." : marker.notes}
                      </div>
                    )}
                  </div>
                  <button 
                    onClick={e => { e.stopPropagation(); removeMarker(marker.id); }}
                    style={{
                      padding: "2px 4px",
                      fontSize: "10px",
                      background: "#ff4444",
                      color: "white",
                      border: "none",
                      borderRadius: "2px",
                      cursor: "pointer"
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={mapCenter}
        zoom={10}
        onClick={status === "accepted" ? onMapClick : undefined}
        onLoad={map => (mapRef.current = map)}
      >
        {markers.map((marker) => (
          <Marker
            key={marker.id}
            position={marker.position}
            onClick={() => setSelectedMarker(selectedMarker?.id === marker.id ? null : marker)}
          />
        ))}
        {selectedMarker && (
          <InfoWindow
            position={selectedMarker.position}
            onCloseClick={() => setSelectedMarker(null)}
          >
            <div style={{ maxWidth: 250 }}>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '14px' }}>{selectedMarker.name}</h4>
              <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#666' }}>{selectedMarker.address}</p>
              {selectedMarker.types && selectedMarker.types.length > 0 && (
                <div style={{ fontSize: '10px', color: '#999', marginBottom: '8px' }}>
                  Types: {selectedMarker.types.slice(0, 3).join(', ')}
                </div>
              )}
              <div style={{ fontSize: '10px', color: '#999', marginBottom: '8px' }}>
                Position: {selectedMarker.position.lat.toFixed(6)}, {selectedMarker.position.lng.toFixed(6)}
              </div>
              {/* Notes Section */}
              <div style={{ marginBottom: '8px' }}>
                <label style={{ fontSize: '10px', fontWeight: 'bold', color: '#333', display: 'block', marginBottom: '4px' }}>
                  Description/Notes:
                </label>
                <textarea
                  value={selectedMarker.notes}
                  onChange={e => updateMarkerNotes(selectedMarker.id, e.target.value)}
                  placeholder="Add your notes about this place..."
                  style={{
                    width: '100%',
                    height: '50px',
                    fontSize: '11px',
                    padding: '4px',
                    border: '1px solid #ccc',
                    borderRadius: '3px',
                    resize: 'vertical',
                    boxSizing: 'border-box',
                    fontFamily: 'inherit'
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button 
                  onClick={() => {
                    let url;
                    if (selectedMarker.placeId) {
                      url = `https://www.google.com/maps/place/?q=place_id:${selectedMarker.placeId}`;
                    } else {
                      url = `https://www.google.com/maps?q=${selectedMarker.position.lat},${selectedMarker.position.lng}`;
                    }
                    window.open(url, '_blank');
                  }}
                  style={{
                    padding: "4px 8px",
                    fontSize: "10px",
                    background: "#4285f4",
                    color: "white",
                    border: "none",
                    borderRadius: "3px",
                    cursor: "pointer",
                    flex: 1
                  }}
                >
                  🗺️ Google Maps
                </button>
                <button 
                  onClick={() => removeMarker(selectedMarker.id)}
                  style={{
                    padding: "4px 8px",
                    fontSize: "10px",
                    background: "#ff4444",
                    color: "white",
                    border: "none",
                    borderRadius: "3px",
                    cursor: "pointer",
                    flex: 1
                  }}
                >
                  🗑️ Delete
                </button>
              </div>
            </div>
          </InfoWindow>
        )}
      </GoogleMap>
    </LoadScript>
  );
}

export default SharedMap;
