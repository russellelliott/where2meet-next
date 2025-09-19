import React, { useMemo, useEffect, useState, useRef } from "react";
import { GoogleMap, Polygon, Autocomplete, Marker, InfoWindow } from "@react-google-maps/api";
import martinez from 'polygon-clipping';

const containerStyle = {
  width: "100%",
  height: "700px"
};

// Default center
const DEFAULT_CENTER = { lat: 37.7749, lng: -122.4194 };

function getAzureMapsKey() {
  const key = process.env.NEXT_PUBLIC_AZURE_MAPS_KEY;
  console.log("Azure Maps Key:", key ? "Found" : "Missing");
  return key;
}

function getGoogleMapsKey() {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  console.log("Google Maps Key:", key ? "Found" : "Missing");
  return key;
}

function geoJsonToGooglePolygonCoords(geoJson) {
  if (
    !geoJson ||
    !geoJson.features ||
    !geoJson.features[0] ||
    !geoJson.features[0].geometry ||
    !geoJson.features[0].geometry.coordinates
  ) {
    return [];
  }
  return geoJson.features[0].geometry.coordinates[0].map(([lng, lat]) => ({ lat, lng }));
}

function geoJsonToPolygonClippingFormat(geoJson) {
  if (
    !geoJson ||
    !geoJson.features ||
    !geoJson.features[0] ||
    !geoJson.features[0].geometry ||
    !geoJson.features[0].geometry.coordinates
  ) {
    return null;
  }
  return geoJson.features[0].geometry.coordinates;
}

// Function to calculate the center of the intersection polygon
function calculatePolygonCenter(polygonPaths) {
  if (!polygonPaths || polygonPaths.length === 0) return null;
  
  let totalLat = 0;
  let totalLng = 0;
  let totalPoints = 0;
  
  polygonPaths.forEach(path => {
    path.forEach(point => {
      totalLat += point.lat;
      totalLng += point.lng;
      totalPoints++;
    });
  });
  
  if (totalPoints === 0) return null;
  
  return {
    lat: totalLat / totalPoints,
    lng: totalLng / totalPoints
  };
}

const polygonOptionsA = {
  fillColor: "#FF0000",
  fillOpacity: 0.35,
  strokeColor: "#FF0000",
  strokeOpacity: 0.8,
  strokeWeight: 2,
  clickable: false,
  draggable: false,
  editable: false,
  geodesic: false,
  zIndex: 1
};

const polygonOptionsB = {
  fillColor: "#0000FF",
  fillOpacity: 0.35,
  strokeColor: "#0000FF",
  strokeOpacity: 0.8,
  strokeWeight: 2,
  clickable: false,
  draggable: false,
  editable: false,
  geodesic: false,
  zIndex: 1
};

const intersectionPolygonOptions = {
  fillColor: "#00FF00",
  fillOpacity: 0.5,
  strokeColor: "#00AA00",
  strokeOpacity: 1,
  strokeWeight: 3,
  clickable: false,
  draggable: false,
  editable: false,
  geodesic: false,
  zIndex: 2
};

function MeetupMap() {
  const [locationA, setLocationA] = useState(null);
  const [locationB, setLocationB] = useState(null);
  const [isochroneA, setIsochroneA] = useState(null);
  const [isochroneB, setIsochroneB] = useState(null);
  const [intersection, setIntersection] = useState(null);
  const [citiesInIntersection, setCitiesInIntersection] = useState([]);
  const [selectedCity, setSelectedCity] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [travelTime, setTravelTime] = useState(null);
  const [userLocation, setUserLocation] = useState(DEFAULT_CENTER);
  const autocompleteA = useRef(null);
  const autocompleteB = useRef(null);

  // Get user's location on component mount
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
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
  }, []);

  // Handle place selection
  const onPlaceChangedA = () => {
    const place = autocompleteA.current.getPlace();
    if (place && place.geometry && place.geometry.location) {
      setLocationA({
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
        name: place.formatted_address || place.name
      });
    }
  };

  const onPlaceChangedB = () => {
    const place = autocompleteB.current.getPlace();
    if (place && place.geometry && place.geometry.location) {
      setLocationB({
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
        name: place.formatted_address || place.name
      });
    }
  };

  // Get travel time between A and B using Google Maps DirectionsService
  useEffect(() => {
    if (!locationA || !locationB) return;
    setLoading(true);
    setError(null);
    const directionsService = new window.google.maps.DirectionsService();
    directionsService.route(
      {
        origin: { lat: locationA.lat, lng: locationA.lng },
        destination: { lat: locationB.lat, lng: locationB.lng },
        travelMode: window.google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status === "OK" && result.routes && result.routes[0] && result.routes[0].legs && result.routes[0].legs[0]) {
          setTravelTime(result.routes[0].legs[0].duration.value); // in seconds
        } else {
          setError("Could not get travel time between cities");
        }
        setLoading(false);
      }
    );
  }, [locationA, locationB]);

  // Fetch isochrones for both cities
  useEffect(() => {
    async function fetchIsochrones() {
      if (!locationA || !locationB || !travelTime) return;
      setLoading(true);
      setError(null);
      const subscriptionKey = getAzureMapsKey();
      if (!subscriptionKey) {
        setError("Azure Maps subscription key missing");
        setLoading(false);
        return;
      }
      // Calculate time budgets with more generous buffers
      // Use 60% of total travel time + 20 minute buffer to ensure overlap
      const baseTimeBudget = Math.ceil(travelTime * 0.5); //reduced from 0.6
      const bufferTime = 900; // 20 minutes in seconds //reduced from 1200
      const timeBudget = baseTimeBudget + bufferTime;

      // Use Azure Maps REST API with subscription key in URL
      // Some Azure Maps endpoints require the subscription key in the URL parameter
      const urlA = `https://atlas.microsoft.com/route/range/json?api-version=1.0&query=${locationA.lat},${locationA.lng}&timeBudgetInSec=${timeBudget}&routeType=fastest&subscription-key=${subscriptionKey}`;
      const urlB = `https://atlas.microsoft.com/route/range/json?api-version=1.0&query=${locationB.lat},${locationB.lng}&timeBudgetInSec=${timeBudget}&routeType=fastest&subscription-key=${subscriptionKey}`;
      
      const requestOptions = {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      };
      
      console.log("Azure Maps URL A:", urlA);
      console.log("Azure Maps URL B:", urlB);
      console.log("Subscription Key:", subscriptionKey.substring(0, 10) + "...");
      try {
        console.log("Making Azure Maps API requests...");
        console.log("URL A:", urlA);
        console.log("URL B:", urlB);
        
        const [respA, respB] = await Promise.all([
          fetch(urlA, requestOptions), 
          fetch(urlB, requestOptions)
        ]);
        
        console.log("Response A status:", respA.status);
        console.log("Response B status:", respB.status);
        
        // Check for HTTP errors
        if (!respA.ok || !respB.ok) {
          let errorMessage = "API request failed: ";
          
          if (!respA.ok) {
            const errorTextA = await respA.text();
            console.error(`Azure Maps API Error for Location A (${respA.status}):`, errorTextA);
            errorMessage += `Location A: ${respA.status} ${respA.statusText}. `;
          }
          
          if (!respB.ok) {
            const errorTextB = await respB.text();
            console.error(`Azure Maps API Error for Location B (${respB.status}):`, errorTextB);
            errorMessage += `Location B: ${respB.status} ${respB.statusText}. `;
          }
          
          // Check if it's an authentication issue
          if (respA.status === 401 || respB.status === 401) {
            errorMessage += "This appears to be an authentication issue. Please check your Azure Maps API key and ensure the Route service is enabled in your Azure subscription.";
          }
          
          throw new Error(errorMessage);
        }
        
        const [jsonA, jsonB] = await Promise.all([respA.json(), respB.json()]);
        
        console.log("Azure Maps Response A:", jsonA);
        console.log("Azure Maps Response B:", jsonB);
        function toGeoJson(json) {
          if (!json.reachableRange || !json.reachableRange.boundary || json.reachableRange.boundary.length < 3) {
            return null;
          }

          const polygonCoordinates = json.reachableRange.boundary.map(point => [point.longitude, point.latitude]);
          
          // Ensure the polygon is valid (at least 3 points)
          if (polygonCoordinates.length < 3) {
            return null;
          }

          // Ensure the polygon is closed
          const first = polygonCoordinates[0];
          const last = polygonCoordinates[polygonCoordinates.length - 1];
          if (first[0] !== last[0] || first[1] !== last[1]) {
            polygonCoordinates.push(first);
          }

          // Validate coordinates
          const isValid = polygonCoordinates.every(coord => 
            typeof coord[0] === 'number' && 
            typeof coord[1] === 'number' &&
            !isNaN(coord[0]) && 
            !isNaN(coord[1])
          );

          if (!isValid) {
            return null;
          }

          return {
            type: "FeatureCollection",
            features: [{
              type: "Feature",
              geometry: { type: "Polygon", coordinates: [polygonCoordinates] },
              properties: {}
            }]
          };
        }

        const isochroneAResult = toGeoJson(jsonA);
        const isochroneBResult = toGeoJson(jsonB);

        if (!isochroneAResult || !isochroneBResult) {
          setError("Invalid isochrone data received from the server");
          setLoading(false);
          return;
        }

        setIsochroneA(isochroneAResult);
        setIsochroneB(isochroneBResult);
      } catch (err) {
        setError("Error fetching isochrones: " + err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchIsochrones();
  }, [locationA, locationB, travelTime]);

  // Calculate intersection and find cities when both isochrones are available
  useEffect(() => {
    async function calculateIntersectionAndFindCities() {
      if (!isochroneA || !isochroneB) {
        setIntersection(null);
        setCitiesInIntersection([]);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // Convert to polygon-clipping format
        const polyA = geoJsonToPolygonClippingFormat(isochroneA);
        const polyB = geoJsonToPolygonClippingFormat(isochroneB);

        if (!polyA || !polyB) {
          setError("Could not process isochrone polygons for intersection");
          setLoading(false);
          return;
        }

        // Calculate intersection
        const intersectionResult = martinez.intersection(polyA, polyB);
        console.log('Intersection result:', intersectionResult);
        
        if (intersectionResult && intersectionResult.length > 0) {
          // Convert intersection back to GeoJSON format for display
          const intersectionGeoJson = {
            type: "FeatureCollection",
            features: intersectionResult.map(polygon => ({
              type: "Feature",
              geometry: { type: "Polygon", coordinates: polygon },
              properties: {}
            }))
          };
          setIntersection(intersectionGeoJson);

          // Find cities within the intersection using Azure Maps
          // Use only the intersection polygons, not the original isochrones
          const cities = await fetchCities(intersectionResult);
          setCitiesInIntersection(cities);
        } else {
          console.log('No intersection found');
          setIntersection(null);
          setCitiesInIntersection([]);
        }
      } catch (err) {
        setError("Error calculating intersection: " + err.message);
      } finally {
        setLoading(false);
      }
    }

    calculateIntersectionAndFindCities();
  }, [isochroneA, isochroneB]);

  // polygons: [poly1, poly2], each is an array of rings
  const fetchCities = async (polygons) => {
    const subscriptionKey = getAzureMapsKey();
    if (!subscriptionKey) {
      throw new Error("Azure Maps subscription key missing");
    }
    // Compose GeometryCollection as required by Azure Maps
    const geometryCollection = {
      geometry: {
        type: 'GeometryCollection',
        geometries: polygons.map(coords => ({
          type: 'Polygon',
          coordinates: coords
        }))
      }
    };
    try {
      // Combine queries for city, town, village, and populated place
      const queries = ["city", "town", "village", "populated place"];
      let allResults = [];
      for (const query of queries) {
        const response = await fetch(
          `https://atlas.microsoft.com/search/geometry/json?api-version=1.0&query=${encodeURIComponent(query)}&limit=100&subscription-key=${subscriptionKey}`,
          {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(geometryCollection)
          }
        );
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Azure Maps Search API Error (${response.status}):`, errorText);
          throw new Error(`Search API request failed: ${response.status} ${response.statusText}`);
        }
        
        const json = await response.json();
        if (json.results) {
          allResults = allResults.concat(json.results);
        }
      }
      // Deduplicate by municipality and countryCode
      const seen = new Set();
      const deduped = allResults.filter(city => {
        const key = `${city.address?.municipality}|${city.address?.countryCode}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return deduped;
    } catch (error) {
      console.error('Fetch error:', error);
      throw error;
    }
  };

  const polygonPathA = useMemo(() => geoJsonToGooglePolygonCoords(isochroneA), [isochroneA]);
  const polygonPathB = useMemo(() => geoJsonToGooglePolygonCoords(isochroneB), [isochroneB]);
  
  const intersectionPaths = useMemo(() => {
    if (!intersection || !intersection.features) return [];
    return intersection.features.map(feature => 
      feature.geometry.coordinates[0].map(([lng, lat]) => ({ lat, lng }))
    );
  }, [intersection]);

  // Calculate map center - prioritize meeting zone center when available
  const mapCenter = useMemo(() => {
    if (intersectionPaths.length > 0) {
      const center = calculatePolygonCenter(intersectionPaths);
      if (center) return center;
    }
    if (locationA && locationB) {
      return {
        lat: (locationA.lat + locationB.lat) / 2,
        lng: (locationA.lng + locationB.lng) / 2
      };
    }
    return locationA || locationB || userLocation;
  }, [intersectionPaths, locationA, locationB, userLocation]);

  // Remove duplicate cities
  const uniqueCities = useMemo(() => {
    const seen = new Set();
    return citiesInIntersection.filter(city => {
      const key = `${city.address?.municipality}|${city.address?.countryCode}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [citiesInIntersection]);

  return (
    <div>
      <div style={{ position: "absolute", zIndex: 200, background: "#fff", padding: 10, left: 10, top: 70, borderRadius: 8, boxShadow: "0 2px 8px #0002", maxWidth: 300 }}>
        <div>
          <label>City A: </label>
          <Autocomplete onLoad={ac => (autocompleteA.current = ac)} onPlaceChanged={onPlaceChangedA}>
            <input type="text" placeholder="Enter city A" style={{ width: 220, marginBottom: 8 }} />
          </Autocomplete>
        </div>
        <div>
          <label>City B: </label>
          <Autocomplete onLoad={ac => (autocompleteB.current = ac)} onPlaceChanged={onPlaceChangedB}>
            <input type="text" placeholder="Enter city B" style={{ width: 220 }} />
          </Autocomplete>
        </div>
        {travelTime && (
          <div style={{ marginTop: 8 }}>
            Travel time: {Math.round(travelTime / 60)} min
          </div>
        )}
        {error === "Could not get travel time between cities" && (
          <div style={{ marginTop: 8, color: 'red', fontWeight: 500 }}>
            Error: {error}
          </div>
        )}
        {intersection && (
          <div style={{ marginTop: 8 }}>
            <strong>Cities in meeting zone ({uniqueCities.length}):</strong>
            <div style={{ maxHeight: 300, overflowY: 'auto', marginTop: 4, fontSize: '12px' }}>
              {uniqueCities.map((city, index) => (
                <div key={index} style={{ margin: '2px 0', cursor: 'pointer', padding: '2px', backgroundColor: selectedCity === city ? '#e0e0e0' : 'transparent' }}
                     onClick={() => setSelectedCity(selectedCity === city ? null : city)}>
                  {city.address?.municipality}, {city.address?.countryCode}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ position: "absolute", zIndex: 200, background: "#fff", padding: 10, right: 10, top: 70, borderRadius: 8, boxShadow: "0 2px 8px #0002", fontSize: '12px' }}>
        <div><span style={{ color: '#FF0000', fontWeight: 'bold' }}>■</span> City A reachable area</div>
        <div><span style={{ color: '#0000FF', fontWeight: 'bold' }}>■</span> City B reachable area</div>
        {intersection && <div><span style={{ color: '#00FF00', fontWeight: 'bold' }}>■</span> Meeting zone</div>}
      </div>

      <GoogleMap 
        mapContainerStyle={containerStyle} 
        center={mapCenter} 
        zoom={8}
        onClick={() => {
          // Close the InfoWindow if a city is selected
          if (selectedCity) {
            setSelectedCity(null);
          }
        }}
      >
        {loading && <div style={{position:'absolute',zIndex:100,background:'#fff',padding:'10px'}}>Loading...</div>}
        {/* Only show other errors (not travel time error) over the map */}
        {error && error !== "Could not get travel time between cities" && (
          <div style={{position:'absolute',zIndex:100,background:'#fff',padding:'10px',color:'red'}}>Error: {error}</div>
        )}
        
        {polygonPathA.length > 0 && <Polygon paths={polygonPathA} options={polygonOptionsA} />}
        {polygonPathB.length > 0 && <Polygon paths={polygonPathB} options={polygonOptionsB} />}
        
        {intersectionPaths.map((path, index) => (
          <Polygon key={`intersection-${index}`} paths={path} options={intersectionPolygonOptions} />
        ))}

        {uniqueCities.map((city, index) => {
          const lon = city.position?.lon ?? city.position?.[0];
          const lat = city.position?.lat ?? city.position?.[1];
          
          if (lat === undefined || lon === undefined) return null;
          
          return (
            <Marker
              key={index}
              position={{ lat, lng: lon }}
              onClick={() => setSelectedCity(selectedCity === city ? null : city)}
              icon={{
                url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
                  <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="10" cy="10" r="8" fill="#00AA00" stroke="#ffffff" stroke-width="2"/>
                    <circle cx="10" cy="10" r="3" fill="#ffffff"/>
                  </svg>
                `),
                scaledSize: new window.google.maps.Size(20, 20),
                anchor: new window.google.maps.Point(10, 10)
              }}
            />
          );
        })}

        {selectedCity && (() => {
          const lon = selectedCity.position?.lon ?? selectedCity.position?.[0];
          const lat = selectedCity.position?.lat ?? selectedCity.position?.[1];
          
          if (lat === undefined || lon === undefined) return null;
          
          return (
            <InfoWindow
              position={{ lat, lng: lon }}
              onCloseClick={() => setSelectedCity(null)}
            >
              <div>
                <h4 style={{ margin: '0 0 5px 0' }}>
                  {selectedCity.address?.municipality}, {selectedCity.address?.countryCode}
                </h4>
                <p style={{ margin: 0, fontSize: '12px' }}>
                  {selectedCity.address?.freeformAddress}
                </p>
              </div>
            </InfoWindow>
          );
        })()}
      </GoogleMap>
    </div>
  );
}

export default MeetupMap;
