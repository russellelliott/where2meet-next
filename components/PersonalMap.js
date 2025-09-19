import React, { useState, useRef, useCallback, useEffect } from "react";
import { sendInviteEmail } from "../utils/emailApi";
import { GoogleMap, LoadScript, Marker, InfoWindow, Autocomplete } from "@react-google-maps/api";
import { auth, database } from "../firebaseConfig";
import { ref, set, remove, onValue, update } from "firebase/database";

const containerStyle = {
  width: "100%",
  height: "700px"
};

const DEFAULT_CENTER = { lat: 37.7749, lng: -122.4194 };

function getGoogleMapsKey() {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
}

function PersonalMap() {
  // Sharing state
  const [shareEmail, setShareEmail] = useState("");
  const [shareLoading, setShareLoading] = useState(false);
  const [shareSuccess, setShareSuccess] = useState("");
  const [shareError, setShareError] = useState("");
  const [markers, setMarkers] = useState([]);
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [mapCenter, setMapCenter] = useState(DEFAULT_CENTER);
  const [loading, setLoading] = useState(false);
  const autocompleteRef = useRef(null);
  const mapRef = useRef(null);
  const user = auth.currentUser;

  // Get user's location and load markers from Firebase on component mount
  useEffect(() => {
    // Get user's location
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

    // Load markers from Firebase
    if (auth.currentUser) {
      const markersRef = ref(database, `users/${auth.currentUser.uid}/markers`);
      
      const unsubscribe = onValue(markersRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          const markersArray = Object.entries(data).map(([id, marker]) => ({
            ...marker,
            id
          }));
          setMarkers(markersArray);
        } else {
          setMarkers([]);
        }
      });

      return () => unsubscribe();
    }
  }, [auth.currentUser]);

  // Handle place selection from autocomplete
  const onPlaceChanged = async () => {
    if (!auth.currentUser) {
      alert("Please sign in to save places");
      return;
    }

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
        const newMarkerRef = ref(database, `users/${auth.currentUser.uid}/markers/${Date.now()}`);
        await set(newMarkerRef, newMarker);
        setMapCenter(newMarker.position);
        setSelectedMarker({ ...newMarker, id: newMarkerRef.key });
        
        // Clear the input
        const input = document.querySelector('input[placeholder="Search for a place..."]');
        if (input) input.value = '';
      } catch (error) {
        console.error("Error saving marker:", error);
        alert("Error saving location. Please try again.");
      }
    }
  };

  // Handle map clicks to drop pins
  const onMapClick = useCallback(async (event) => {
    if (!auth.currentUser) {
      alert("Please sign in to save places");
      return;
    }

    // If there's a selected marker, close it first without creating a new marker
    if (selectedMarker) {
      setSelectedMarker(null);
      return;
    }

    const lat = event.latLng.lat();
    const lng = event.latLng.lng();
    
    setLoading(true);
    
    try {
      // Use Google Maps Geocoding API to get place information
      const geocoder = new window.google.maps.Geocoder();
      
      geocoder.geocode(
        { location: { lat, lng } },
        async (results, status) => {
          let newMarker;
          const markerId = Date.now();
          
          if (status === "OK" && results && results.length > 0) {
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
            const newMarkerRef = ref(database, `users/${auth.currentUser.uid}/markers/${markerId}`);
            await set(newMarkerRef, newMarker);
            // Automatically select the newly created marker to show InfoWindow
            setSelectedMarker({ ...newMarker, id: markerId });
          } catch (error) {
            console.error("Error saving marker:", error);
            alert("Error saving location. Please try again.");
          }
          
          setLoading(false);
        }
      );
    } catch (error) {
      console.error("Error geocoding location:", error);
      setLoading(false);
      alert("Error creating marker. Please try again.");
    }
  }, [selectedMarker]);

  // Update marker notes
  const updateMarkerNotes = async (markerId, notes) => {
    if (!auth.currentUser) {
      alert("Please sign in to edit places");
      return;
    }

    try {
      const markerRef = ref(database, `users/${auth.currentUser.uid}/markers/${markerId}`);
      await update(markerRef, { notes });
      
      // Update selectedMarker to keep it in sync
      if (selectedMarker && selectedMarker.id === markerId) {
        setSelectedMarker(prev => ({ ...prev, notes }));
      }
    } catch (error) {
      console.error("Error updating marker notes:", error);
      alert("Error updating notes. Please try again.");
    }
  };

  // Remove a marker
  const removeMarker = async (markerId) => {
    if (!auth.currentUser) {
      alert("Please sign in to remove places");
      return;
    }

    try {
      const markerRef = ref(database, `users/${auth.currentUser.uid}/markers/${markerId}`);
      await remove(markerRef);
      setSelectedMarker(null);
    } catch (error) {
      console.error("Error removing marker:", error);
      alert("Error removing location. Please try again.");
    }
  };

  // Clear all markers
  const clearAllMarkers = async () => {
    if (!auth.currentUser) {
      alert("Please sign in to clear places");
      return;
    }

    if (window.confirm("Are you sure you want to remove all saved places? This cannot be undone.")) {
      try {
        const markersRef = ref(database, `users/${auth.currentUser.uid}/markers`);
        await remove(markersRef);
        setSelectedMarker(null);
      } catch (error) {
        console.error("Error clearing markers:", error);
        alert("Error clearing locations. Please try again.");
      }
    }
  };

  const onLoad = useCallback((map) => {
    mapRef.current = map;
  }, []);

  // Share handler
  const handleShare = async () => {
    setShareSuccess("");
    setShareError("");
    if (!auth.currentUser) {
      setShareError("Please sign in to share your map.");
      return;
    }
    if (!shareEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(shareEmail)) {
      setShareError("Please enter a valid email address.");
      return;
    }
    setShareLoading(true);
    try {
      // Use user's UID as mapId for now; you may want to use a real mapId if supporting multiple maps
      await sendInviteEmail({
        senderEmail: auth.currentUser.email,
        senderName: auth.currentUser.displayName || auth.currentUser.email,
        recipientEmail: shareEmail,
        mapId: auth.currentUser.uid,
        mapName: `${auth.currentUser.displayName || 'User'}'s Personal Map`
      });
      setShareSuccess("Invitation sent!");
      setShareEmail("");
    } catch (e) {
      setShareError("Failed to send invite. Try again later.");
    }
    setShareLoading(false);
  };

  return (
    <LoadScript googleMapsApiKey={getGoogleMapsKey()} libraries={["places"]}>
      <div style={{ 
        position: "absolute", 
        zIndex: 200, 
        background: "#fff", 
        padding: 15, 
        left: 10, 
        top: 70, 
        borderRadius: 8, 
        boxShadow: "0 2px 8px #0002", 
        maxWidth: 350 
      }}>
        {/* Share map UI */}
        {auth.currentUser && (
          <div style={{ marginBottom: 12, padding: 8, background: '#f6faff', borderRadius: 6, border: '1px solid #e0eaff' }}>
            <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 4 }}>Share your map by email:</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type="email"
                placeholder="Recipient's email"
                value={shareEmail}
                onChange={e => setShareEmail(e.target.value)}
                style={{ flex: 1, padding: 6, border: '1px solid #ccc', borderRadius: 4, fontSize: 13 }}
                disabled={shareLoading}
              />
              <button
                onClick={handleShare}
                disabled={shareLoading}
                style={{ padding: '6px 12px', background: '#4285f4', color: '#fff', border: 'none', borderRadius: 4, fontSize: 13, cursor: 'pointer' }}
              >
                {shareLoading ? 'Sending...' : 'Share'}
              </button>
            </div>
            {shareSuccess && <div style={{ color: 'green', fontSize: 12, marginTop: 4 }}>{shareSuccess}</div>}
            {shareError && <div style={{ color: 'red', fontSize: 12, marginTop: 4 }}>{shareError}</div>}
          </div>
        )}
        <h3 style={{ margin: "0 0 10px 0", fontSize: "16px" }}>Personal Map</h3>
        {!auth.currentUser && (
          <div style={{ 
            padding: "10px", 
            marginBottom: "10px", 
            backgroundColor: "#f8f8f8", 
            borderRadius: "4px",
            color: "#666",
            fontSize: "14px"
          }}>
            Please sign in to save and view your places
          </div>
        )}
        <div style={{ marginBottom: 10 }}>
          <Autocomplete 
            onLoad={ac => (autocompleteRef.current = ac)} 
            onPlaceChanged={onPlaceChanged}
          >
            <input 
              type="text" 
              placeholder="Search for a place..." 
              style={{ 
                width: "100%", 
                padding: "8px", 
                border: "1px solid #ccc", 
                borderRadius: "4px",
                boxSizing: "border-box"
              }} 
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
        
        <div style={{ 
          maxHeight: 200, 
          overflowY: 'auto', 
          fontSize: '12px',
          border: markers.length > 0 ? "1px solid #eee" : "none",
          borderRadius: "4px"
        }}>
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
                onClick={(e) => {
                  e.stopPropagation();
                  removeMarker(marker.id);
                }}
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
      </div>

      <GoogleMap 
        mapContainerStyle={containerStyle} 
        center={mapCenter} 
        zoom={10}
        onClick={onMapClick}
        onLoad={onLoad}
      >
        {loading && (
          <div style={{
            position:'absolute',
            zIndex:100,
            background:'#fff',
            padding:'10px',
            borderRadius: '4px',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)'
          }}>
            Loading place information...
          </div>
        )}
        
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
              <h4 style={{ margin: '0 0 8px 0', fontSize: '14px' }}>
                {selectedMarker.name}
              </h4>
              <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#666' }}>
                {selectedMarker.address}
              </p>
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
                  Personal Notes:
                </label>
                <textarea
                  value={selectedMarker.notes}
                  onChange={(e) => updateMarkerNotes(selectedMarker.id, e.target.value)}
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
                      // Use place ID for actual place page
                      url = `https://www.google.com/maps/place/?q=place_id:${selectedMarker.placeId}`;
                    } else {
                      // Fallback to coordinates for dropped pins without place ID
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

export default PersonalMap;
