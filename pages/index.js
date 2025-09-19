
import React, { useState, useEffect } from "react";
import { auth, provider } from "../firebaseConfig";
import { signInWithPopup, signOut } from "firebase/auth";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/router";
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const MeetupMap = dynamic(() => import("../components/MeetupMap"), { ssr: false });
const GoogleMapsProvider = dynamic(() => import("../components/GoogleMapsContext").then(mod => mod.GoogleMapsProvider), { ssr: false });

function AppContent() {
  const [user, setUser] = useState(null);
  const router = useRouter();

  useEffect(() => {
    // Set up authentication listener
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setUser(user);
    });
    return () => unsubscribe();
  }, []);

  const handleSignIn = async () => {
    try {
      await signInWithPopup(auth, provider);
      toast.success("Successfully signed in!");
    } catch (error) {
      console.error("Error signing in with Google: ", error);
      toast.error("Error signing in: " + error.message);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      toast.success("Successfully signed out!");
    } catch (error) {
      console.error("Error signing out: ", error);
      toast.error("Error signing out: " + error.message);
    }
  };

  const navStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    background: '#fff',
    padding: '10px 20px',
    borderBottom: '1px solid #ddd',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    gap: '20px'
  };

  const buttonStyle = (isActive) => ({
    padding: '8px 16px',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    background: isActive ? '#4285f4' : '#f0f0f0',
    color: isActive ? '#fff' : '#333',
    transition: 'all 0.2s ease'
  });

  const contentStyle = {
    marginTop: '60px',
    height: 'calc(100vh - 60px)'
  };

  return (
    <GoogleMapsProvider>
      <div className="App">
        <nav style={navStyle}>
          <h1 style={{ margin: 0, fontSize: '18px', color: '#333' }}>Where2Meet</h1>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <button style={buttonStyle(router.pathname === '/')}>🤝 Meetup Planner</button>
          </Link>
          <Link href="/create-map" style={{ textDecoration: 'none' }}>
            <button style={buttonStyle(router.pathname === '/create-map')}>✨ Create New Map</button>
          </Link>
          <Link href="/my-maps" style={{ textDecoration: 'none' }}>
            <button style={buttonStyle(router.pathname === '/my-maps')}>📍 My Maps</button>
          </Link>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
            {user ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <img
                    src={user.photoURL}
                    alt={user.displayName}
                    style={{ width: '32px', height: '32px', borderRadius: '50%' }}
                  />
                  <span style={{ fontSize: '14px' }}>{user.displayName}</span>
                </div>
                <button
                  style={{
                    ...buttonStyle(false),
                    background: '#ff4444',
                    color: 'white',
                  }}
                  onClick={handleSignOut}
                >
                  Sign Out
                </button>
              </>
            ) : (
              <button
                style={{
                  ...buttonStyle(false),
                  background: '#4285f4',
                  color: 'white',
                }}
                onClick={handleSignIn}
              >
                Sign in with Google
              </button>
            )}
          </div>
        </nav>
        <div style={contentStyle}>
          <MeetupMap />
        </div>
      </div>
      <ToastContainer
        position="top-right"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="light"
      />
    </GoogleMapsProvider>
  );
}

export default AppContent;
