import React from 'react';
import dynamic from 'next/dynamic';
import Navbar from '../components/Navbar';
import { CircularProgress, Box, Typography, Button } from '@mui/material';
import { useFirebaseAuth } from '../context/FirebaseAuthContext';
import { auth, GoogleAuthProvider, signInWithPopup } from '../firebaseConfig';

// Dynamically import FriendsDashboard to avoid SSR issues with Firebase
const FriendsDashboard = dynamic(() => import('../components/FriendDashboard/FriendsDashboard'), {
  ssr: false,
  loading: () => null,
});

export default function FriendsPage() {
  const { user: firebaseUser, loading: authLoading, signOut: signOutGlobal } = useFirebaseAuth();

  const handleSignIn = async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      } catch (error) {
      console.error('Error signing in:', error);
      }
    };

  const handleSignOut = async () => {
    try {
      await signOutGlobal();
      } catch (error) {
      console.error('Error signing out:', error);
      }
    };

  if (authLoading) {
    return (
          <div style={{ minHeight: '100vh', bgcolor: '#f5f5f5' }}>
            <Navbar />
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 80px)' }}>
              <CircularProgress />
              </Box>
            </div>
          );
        }

  if (!firebaseUser) {
    return (
          <div style={{ minHeight: '100vh', bgcolor: '#f5f5f5' }}>
            <Navbar />
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 80px)', flexDirection: 'column', gap: 2 }}>
              <Typography variant="h5" color="text.secondary">
              Please sign in to access the Friends Dashboard
                </Typography>
                <Button 
              variant="contained" 
              onClick={handleSignIn}
              sx={{ bgcolor: '#4285F4', '&:hover': { bgcolor: '#3367D6' } }}
                >
              Sign in with Google
                </Button>
              </Box>
            </div>
          );
        }

  return (
          <div style={{ minHeight: '100vh', bgcolor: '#f5f5f5' }}>
            <Navbar />
            {/* FriendsDashboard manages its own Firebase auth via auth.onAuthStateChanged
                (same pattern as MasterMap, MyMaps, PersonalMap). This ensures Firestore 
               and Auth share the same internal state, preventing "Missing or insufficient 
               permissions" errors on page reload. */}
            <FriendsDashboard onSignOut={handleSignOut} />
          </div>
        );
}
