import React from "react";
import { useRouter } from "next/router";
import dynamic from "next/dynamic";

const Map = dynamic(() => import("../../components/Map"), { ssr: false });
const GoogleMapsProvider = dynamic(() => import("../../components/GoogleMapsContext").then(mod => mod.GoogleMapsProvider), { ssr: false });

export default function MapPage() {
  const router = useRouter();
  const { mapId } = router.query;

  if (!mapId) return null; // Optionally show a loading spinner

  return (
    <GoogleMapsProvider>
      <Map mapId={mapId} />
    </GoogleMapsProvider>
  );
}
