import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { auth } from '../firebaseConfig';
import { onAuthStateChanged, signOut as firebaseSignOut, getIdToken } from 'firebase/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
     // Set a timeout in case Firebase auth listener never fires
    const initTimeout = setTimeout(() => {
      setAuthReady(true);
      setLoading(false);
     }, 5000);

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
       // Force a fresh token refresh whenever auth state changes
       // This ensures all subsequent Firestore calls use a valid token
      if (currentUser) {
        try {
          await getIdToken(currentUser, true);
          console.log('[Auth] Token refreshed successfully on auth state change');
           } catch (tokenError) {
          console.error('[Auth] Token refresh failed:', tokenError);
           // If token refresh fails, the user is still logged in but Firestore calls
           // may fail. They'll be prompted to sign in again on first failure.
          }
        }
      
      setAuthReady(true);
      setLoading(false);
      clearTimeout(initTimeout);
     });

    return () => {
      unsubscribe();
      clearTimeout(initTimeout);
     };
   }, []);

  const signOut = useCallback(() => {
    return firebaseSignOut(auth);
  }, []);

  const value = {
    user,
    loading: authReady ? loading : true,
    ready: authReady,
    signOut,
   };

  return (
     <AuthContext.Provider value={value}>
       {children}
     </AuthContext.Provider>
   );
 }

 export function useFirebaseAuth() {
   const context = useContext(AuthContext);
   if (context === null) {
     throw new Error('useFirebaseAuth must be used within an AuthProvider');
    }
   return context;
 }

 // Helper to get the current user synchronously
 export function getCurrentUser() {
   return auth.currentUser;
 }