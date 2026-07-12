import React, { useState, useEffect } from 'react';
import { auth, db } from '../firebaseConfig';
import { collection, query, where, getDocs } from 'firebase/firestore';
import Link from 'next/link';
import { toast } from 'react-toastify';

function MyMaps() {
  const [loading, setLoading] = useState(true);
  const [ownedMaps, setOwnedMaps] = useState([]);
  const [collaborativeMaps, setCollaborativeMaps] = useState([]);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [poiCounts, setPoiCounts] = useState({}); // { mapId: countOfPoisVisibleOnThatMap }

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setUser(user);
      setAuthLoading(false);
       });
    return () => unsubscribe();
     }, []);

     // Load maps and POI counts together after user is known
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const loadData = async () => {
      try {
        setLoading(true);

           // Fetch maps owned by the user
        const mapsCollection = collection(db, 'maps');
        const ownedMapsQuery = query(mapsCollection, where('owner', '==', user.uid));
        const ownedSnapshot = await getDocs(ownedMapsQuery);

        const ownedMapsData = ownedSnapshot.docs.map(doc => ({
          id: doc.id,
             ...doc.data()
           }));

           // Fetch maps where user is a collaborator
        const collaborativeMapsQuery = query(
          mapsCollection,
          where(`collaborators.${user.uid}.status`, '==', 'accepted')
           );
        const collaborativeSnapshot = await getDocs(collaborativeMapsQuery);

        const collaborativeMapsData = collaborativeSnapshot.docs.map(doc => ({
          id: doc.id,
             ...doc.data()
           }));

           // Fetch user POIs and compute counts per map
        let poiCountsResult = {};
        try {
          const poiSnapshot = await getDocs(collection(db, 'users', user.uid, 'poi'));
          const pois = poiSnapshot.docs.map(docSnap => ({ ...docSnap.data(), id: docSnap.id }));

          // Count POIs per map based on visibility
          const counts = {};

          pois.forEach(poi => {
            const visibility = poi.visibility || {};
            const scope = visibility.scope || 'selective';
            if (scope === 'all') {
               // Counts toward all owned maps
              ownedMapsData.forEach(m => { counts[m.id] = (counts[m.id] || 0) + 1; });
              } else if (scope === 'selective' && Array.isArray(visibility.allowedMapIds)) {
             visibility.allowedMapIds.forEach(mapId => {
               counts[mapId] = (counts[mapId] || 0) + 1;
                 });
               }
             });

          poiCountsResult = counts;
           } catch (poiErr) {
          console.error('Failed to load POI counts:', poiErr);
          }

           // Update state only if not cancelled
        if (!cancelled) {
          setOwnedMaps(ownedMapsData);
          setCollaborativeMaps(collaborativeMapsData);
          setPoiCounts(poiCountsResult);
          setLoading(false);
          }
         } catch (error) {
        console.error('Error fetching data:', error);
        toast.error('Failed to load maps. Please try again.');
        if (!cancelled) setLoading(false);
          }
        };

    loadData();
    return () => { cancelled = true; };
     }, [user]);

  if (authLoading) {
    return (
       <div style={styles.container}>
          <h2>My Maps</h2>
          <p>Loading...</p>
        </div>
      );
    }

  if (!user) {
    return (
       <div style={styles.container}>
          <h2>My Maps</h2>
          <p>Please sign in to view your maps.</p>
        </div>
      );
    }

  if (loading) {
    return (
       <div style={styles.container}>
          <h2>My Maps</h2>
          <p>Loading maps...</p>
        </div>
      );
    }

   // Helper: get POI count for a map (selective + scope-all)
  const getPoiCountForMap = (mapId) => {
    const globalAll = poiCounts._globalAll || 0;
    const mapSelective = poiCounts[mapId] || 0;
     return mapSelective + globalAll;
   };

  return (
      <div style={styles.container}>
          <h2>My Maps</h2>

          <div style={styles.section}>
          <h3>Maps I Own</h3>
          {ownedMaps.length === 0 ? (
            <p>You haven't created any maps yet.</p>
          ) : (
            <div style={styles.mapGrid}>
              {ownedMaps.map(map => (
                  <Link href={`/map/${map.id}`} key={map.id} style={styles.mapCard}>
                    <h4>{map.name}</h4>
                    <p>Created {new Date(map.createdAt).toLocaleDateString()}</p>
                    <p>{getPoiCountForMap(map.id)} POIs visible</p>
                    <p>{Object.keys(map.collaborators || {}).length} collaborators</p>
                  </Link>
                ))}
            </div>
          )}
        </div>

          <div style={styles.section}>
          <h3>Maps I'm Collaborating On</h3>
          {collaborativeMaps.length === 0 ? (
            <p>You're not collaborating on any maps yet.</p>
          ) : (
            <div style={styles.mapGrid}>
              {collaborativeMaps.map(map => (
                  <Link href={`/map/${map.id}`} key={map.id} style={styles.mapCard}>
                    <h4>{map.name}</h4>
                    <p>Owner: {map.ownerEmail}</p>
                    <p>{getPoiCountForMap(map.id)} POIs visible</p>
                  </Link>
                ))}
            </div>
          )}
        </div>
      </div>
    );
}

const styles = {
  container: {
    padding: '20px',
    maxWidth: '1200px',
    margin: '0 auto'
    },
  section: {
    marginBottom: '40px'
    },
  mapGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
    gap: '20px',
    marginTop: '20px'
    },
  mapCard: {
    padding: '20px',
    border: '1px solid #e0e0e0',
    borderRadius: '8px',
    textDecoration: 'none',
    color: 'inherit',
    backgroundColor: 'white',
    transition: 'transform 0.2s, box-shadow 0.2s',
    }
};

export default MyMaps;