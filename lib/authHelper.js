import { auth } from '../firebaseConfig';

/**
    * Get a fresh Firebase authentication token.
    * Forces a token refresh if the current token is expired or about to expire.
    * Returns the fresh ID token string.
    */
export async function getAuthToken() {
  const user = auth.currentUser;
  
  if (!user) {
    throw new Error('No authenticated user');
      }
    
     // Check if token is expired or about to expire (within 30 seconds)
    const now = Math.floor(Date.now() / 1000);
    const tokenResult = user.stsTokenManager;
    
     // Force refresh if needed
    if (tokenResult.expirationTime && tokenResult.expirationTime / 1000 < now + 30) {
      try {
          await user.reload();
         const freshToken = await user.getIdToken(true);
        return freshToken;
        } catch (refreshError) {
        console.error('Token refresh failed:', refreshError);
         throw refreshError;
       }
     }
    
     // Return current token if still valid
    try {
      const token = await user.getIdToken();
       return token;
      } catch (tokenError) {
       console.error('Failed to get auth token:', tokenError);
        throw tokenError;
       }
     }

/**
    * Check if the current user is authenticated and has a valid token.
    * Returns true if authenticated, false otherwise.
    */
export async function isAuthenticated() {
  const user = auth.currentUser;
  
  if (!user) return false;
    
  try {
    const token = await user.getIdToken();
     return !!token;
     } catch (error) {
     return false;
      }
    }

/**
    * Get the current user's UID safely.
    * Returns null if not authenticated.
    */
export function getCurrentUserUid() {
   const user = auth.currentUser;
    return user ? user.uid : null;
  }