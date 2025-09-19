// components/MinimalMap.js
"use client"; // Ensure client-side rendering in Next.js 13+

import React, { useState, useEffect } from "react";
import { GoogleMap, LoadScript } from "@react-google-maps/api";

const containerStyle = {
  width: "100%",
  height: "400px",
};

const DEFAULT_CENTER = { lat: 37.7749, lng: -122.4194 };

export default function MinimalMap() {
  const [mapCenter, setMapCenter] = useState(DEFAULT_CENTER);

  useEffect(() => {
    console.log(
      "Google Maps API Key:",
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    );
  }, []);

  return (
    <div>
      <LoadScript
        googleMapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}
      >
        <GoogleMap
          mapContainerStyle={containerStyle}
          center={mapCenter}
          zoom={10}
        >
          {/* Markers or children go here if needed */}
        </GoogleMap>
      </LoadScript>
    </div>
  );
}
