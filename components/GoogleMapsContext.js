import React from 'react';
import { LoadScript } from "@react-google-maps/api";

export const GoogleMapsContext = React.createContext(null);

function getGoogleMapsKey() {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
}

export function GoogleMapsProvider({ children }) {
  const apiKey = getGoogleMapsKey();
  console.log("GoogleMapsContext - API Key:", apiKey ? "Found" : "Missing");
  
  return (
    <LoadScript googleMapsApiKey={apiKey} libraries={["places"]}>
      <GoogleMapsContext.Provider value={true}>
        {children}
      </GoogleMapsContext.Provider>
    </LoadScript>
  );
}
