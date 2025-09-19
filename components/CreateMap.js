import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { auth, db } from '../firebaseConfig';
import { doc, setDoc } from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid';


function CreateMap() {
  const [mapName, setMapName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const user = auth.currentUser;

  const createNewMap = async (e) => {
    e.preventDefault();
    if (!user) {
      setError('Please sign in to create a map');
      return;
    }

    if (!mapName.trim()) {
      setError('Please enter a map name');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Generate a UUID for the map
      const mapId = uuidv4();
      
      // Create the map in Firestore
      const mapData = {
        id: mapId,
        name: mapName,
        owner: user.uid,
        ownerEmail: user.email,
        createdAt: Date.now(),
        collaborators: {},
      };

      const mapRef = doc(db, 'maps', mapId);
      await setDoc(mapRef, mapData);

  // Navigate to the new map
  router.push(`/map/${mapId}`);
    } catch (err) {
      setError('Error creating map: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return <div>Please sign in to create a map.</div>;
  }

  return (
    <div style={{ maxWidth: '600px', margin: '40px auto', padding: '20px' }}>
      <h1>Create New Map</h1>
      {error && (
        <div style={{ color: 'red', marginBottom: '20px' }}>
          {error}
        </div>
      )}
      <form onSubmit={createNewMap}>
        <div style={{ marginBottom: '20px' }}>
          <label htmlFor="mapName" style={{ display: 'block', marginBottom: '8px' }}>
            Map Name:
          </label>
          <input
            type="text"
            id="mapName"
            value={mapName}
            onChange={(e) => setMapName(e.target.value)}
            style={{
              width: '100%',
              padding: '8px',
              fontSize: '16px',
              borderRadius: '4px',
              border: '1px solid #ccc'
            }}
            placeholder="Enter a name for your map"
            disabled={loading}
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '10px 20px',
            fontSize: '16px',
            backgroundColor: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1
          }}
        >
          {loading ? 'Creating...' : 'Create Map'}
        </button>
      </form>
    </div>
  );
}

export default CreateMap;
