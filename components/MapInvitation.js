import React, { useState, useEffect } from 'react';
import { auth, db } from '../firebaseConfig';
import { doc, getDoc, updateDoc } from 'firebase/firestore';

import { toast } from 'react-toastify';

function MapInvitation({ mapId, onResponse }) {
  const [loading, setLoading] = useState(true);
  const [mapInfo, setMapInfo] = useState(null);
  const [error, setError] = useState(null);
  const user = auth.currentUser;

  useEffect(() => {
    const loadMapInfo = async () => {
      if (!user || !mapId) return;

      try {
        const mapRef = doc(db, 'maps', mapId);
        const snapshot = await getDoc(mapRef);
        
        if (snapshot.exists()) {
          const mapData = snapshot.data();
          setMapInfo(mapData);
          
          // Check if user is already a collaborator
          if (mapData.collaborators?.[user.uid]?.status === 'accepted') {
            onResponse('accepted');
          }
        } else {
          setError('Map not found');
        }
      } catch (err) {
        setError('Error loading map information');
        console.error('Error:', err);
      } finally {
        setLoading(false);
      }
    };

    loadMapInfo();
  }, [mapId, user, onResponse]);

  const handleResponse = async (response) => {
    if (!user || !mapId) return;

    try {
      setLoading(true);
      const mapRef = doc(db, 'maps', mapId);
      
      // First, get the current map data
      const mapSnapshot = await getDoc(mapRef);
      if (!mapSnapshot.exists()) {
        throw new Error('Map not found');
      }
      
      const currentData = mapSnapshot.data();
      const updatedCollaborators = {
        ...currentData.collaborators,
        [user.uid]: {
          status: response,
          email: user.email,
          name: user.displayName,
          respondedAt: Date.now()
        }
      };
      
      await updateDoc(mapRef, {
        collaborators: updatedCollaborators
      });

      // Send response emails
      try {
        // Call Next.js API route to send response email
        const res = await fetch('/api/email/response', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            senderEmail: user.email,
            senderName: user.displayName || 'A user',
            ownerEmail: mapInfo.ownerEmail,
            mapName: mapInfo.name,
            response
          })
        });
        if (!res.ok) throw new Error('Failed to send response email');
        toast.success(`Successfully ${response} the invitation`);
      } catch (err) {
        console.error('Error sending response emails:', err);
        toast.error('Failed to send notification emails, but your response was recorded');
        // Don't block the response update if email sending fails
      }

      onResponse(response);
    } catch (err) {
      console.error('Error:', err);
      toast.error('Failed to update response. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <p>Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <p style={styles.error}>{error}</p>
      </div>
    );
  }

  if (!mapInfo) {
    return (
      <div style={styles.container}>
        <p>Map not found</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Map Invitation</h2>
      <p style={styles.description}>
        You've been invited to collaborate on <strong>{mapInfo.name}</strong>
      </p>
      <div style={styles.buttonContainer}>
        <button
          style={{ ...styles.button, ...styles.acceptButton }}
          onClick={() => handleResponse('accepted')}
        >
          Accept
        </button>
        <button
          style={{ ...styles.button, ...styles.declineButton }}
          onClick={() => handleResponse('declined')}
        >
          Decline
        </button>
      </div>
    </div>
  );
}

const styles = {
  container: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    background: 'white',
    padding: '2rem',
    borderRadius: '8px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
    maxWidth: '400px',
    width: '90%',
    textAlign: 'center',
    zIndex: 1000,
  },
  title: {
    marginTop: 0,
    color: '#333',
    fontSize: '24px',
  },
  description: {
    color: '#666',
    marginBottom: '2rem',
  },
  buttonContainer: {
    display: 'flex',
    gap: '1rem',
    justifyContent: 'center',
  },
  button: {
    padding: '10px 20px',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: '500',
    transition: 'background-color 0.2s',
  },
  acceptButton: {
    backgroundColor: '#4CAF50',
    color: 'white',
    '&:hover': {
      backgroundColor: '#45a049',
    },
  },
  declineButton: {
    backgroundColor: '#f44336',
    color: 'white',
    '&:hover': {
      backgroundColor: '#da190b',
    },
  },
  error: {
    color: '#f44336',
  },
};

export default MapInvitation;
