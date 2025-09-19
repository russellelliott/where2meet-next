import React, { useState, useEffect } from 'react';
import { auth, db } from '../firebaseConfig';
import { collection, query, where, getDocs } from 'firebase/firestore';
import Link from 'next/link';
import { toast } from 'react-toastify';

function MyMaps() {
  const [loading, setLoading] = useState(true);
  const [ownedMaps, setOwnedMaps] = useState([]);
  const [collaborativeMaps, setCollaborativeMaps] = useState([]);
  const user = auth.currentUser;

  useEffect(() => {
    const fetchMaps = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        // Fetch maps owned by the user
        const mapsCollection = collection(db, 'maps');
        const ownedMapsQuery = query(mapsCollection, where('owner', '==', user.uid));
        const ownedSnapshot = await getDocs(ownedMapsQuery);
        
        const ownedMapsData = ownedSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setOwnedMaps(ownedMapsData);

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
        setCollaborativeMaps(collaborativeMapsData);

      } catch (error) {
        console.error('Error fetching maps:', error);
        toast.error('Failed to load maps. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchMaps();
  }, [user]);

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
                <p>{Object.keys(map.markers || {}).length} places marked</p>
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
                <p>{Object.keys(map.markers || {}).length} places marked</p>
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
