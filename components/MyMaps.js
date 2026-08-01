import React, { useState, useEffect } from 'react';
import { auth, db } from '../firebaseConfig';
import { collection, query, where, getDocs } from 'firebase/firestore';
import Link from 'next/link';
import { toast } from 'react-toastify';
import { deleteMapWithCascades } from '../lib/deletionService';

function MyMaps() {
  const [loading, setLoading] = useState(true);
  const [ownedMaps, setOwnedMaps] = useState([]);
  const [collaborativeMaps, setCollaborativeMaps] = useState([]);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [poiCounts, setPoiCounts] = useState({}); // { mapId: countOfPoisVisibleOnThatMap }
  const [deleteConfirmMapId, setDeleteConfirmMapId] = useState(null);

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

    // Handle map deletion with cascade
  const handleDeleteMap = async () => {
    if (!deleteConfirmMapId || !user) return;
    try {
      await deleteMapWithCascades(user.uid, deleteConfirmMapId);
      // Remove from local state immediately
      setOwnedMaps(prev => prev.filter(m => m.id !== deleteConfirmMapId));
      setDeleteConfirmMapId(null);
      toast.success('Map deleted successfully!');
      } catch (err) {
      console.error('Error deleting map:', err);
      toast.error('Failed to delete map. Please try again.');
     }
    };

  return (
       <div style={styles.container}>
           <h2>My Maps</h2>

           {/* Map Deletion Confirmation Dialog */}
           {deleteConfirmMapId && (
             <div style={{
               position: 'fixed',
               top: '50%',
               left: '50%',
               transform: 'translate(-50%, -50%)',
               backgroundColor: 'white',
               padding: '24px',
               borderRadius: '8px',
               boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
               zIndex: 1000,
               minWidth: '350px'
             }}>
               <h3 style={{ margin: '0 0 15px 0', fontSize: '18px', color: '#ff4444' }}>Delete Map</h3>
               <p style={{ margin: '0 0 15px 0', fontSize: '14px' }}>Are you sure you want to delete this map? This action cannot be undone. All POIs that were only visible on this map will have their scope changed to "all".</p>
               <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                 <button
                   onClick={() => setDeleteConfirmMapId(null)}
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
                   onClick={handleDeleteMap}
                   style={{
                     padding: '8px 16px',
                     fontSize: '14px',
                     border: 'none',
                     borderRadius: '4px',
                     backgroundColor: '#ff4444',
                     color: 'white',
                     cursor: 'pointer'
                   }}
                 >
                   Delete Map
                 </button>
               </div>
             </div>
           )}

           <div style={styles.section}>
          <h3>Maps I Own</h3>
          {ownedMaps.length === 0 ? (
            <p>You haven't created any maps yet.</p>
          ) : (
            <div style={styles.mapGrid}>
              {ownedMaps.map(map => (
                    <div key={map.id} style={styles.mapCardContainer}>
                      <Link href={`/map/${map.id}`} style={styles.mapCard}>
                        <h4>{map.name}</h4>
                        <p>Created {new Date(map.createdAt).toLocaleDateString()}</p>
                        <p>{getPoiCountForMap(map.id)} POIs visible</p>
                        <p>{Object.keys(map.collaborators || {}).length} collaborators</p>
                      </Link>
                      {(map.owner === user.uid) && (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setDeleteConfirmMapId(map.id);
                          }}
                          style={{
                            marginTop: '8px',
                            padding: '4px 12px',
                            fontSize: '12px',
                            border: '1px solid #ff4444',
                            borderRadius: '4px',
                            backgroundColor: 'white',
                            color: '#ff4444',
                            cursor: 'pointer'
                          }}
                        >
                          Delete Map
                        </button>
                      )}
                    </div>
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
  mapCardContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
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