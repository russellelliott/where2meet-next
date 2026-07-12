import React, { useState, useEffect } from "react";
import { useRouter } from "next/router";
import dynamic from "next/dynamic";
import { ToastContainer } from 'react-toastify';

const Map = dynamic(() => import("../../components/Map"), { ssr: false });

export default function MapPage() {
  const router = useRouter();
  const { mapId } = router.query;
  const [mapInfo, setMapInfo] = useState(null);

   // Load map info for the title
  useEffect(() => {
    const loadMapInfo = async () => {
      if (!mapId) return;
      try {
        const { doc, getDoc } = await import("firebase/firestore");
        const { db } = await import("../../firebaseConfig");
        const snapshot = await getDoc(doc(db, 'maps', mapId));
        if (snapshot.exists()) {
          setMapInfo(snapshot.data());
        }
         } catch (error) {
        console.error("Error loading map info:", error);
        }
       };
    loadMapInfo();
   }, [mapId]);

  if (!mapId) return null;

   return (
          <div>
            <div style={{ marginTop: '60px', height: 'calc(100vh - 70px)', overflow: 'hidden' }}>
              <Map mapId={mapId} />
            </div>
          <ToastContainer />
        </div>
    );
}
