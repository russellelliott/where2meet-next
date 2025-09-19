import React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/router";
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const CreateMap = dynamic(() => import("../components/CreateMap"), { ssr: false });
const GoogleMapsProvider = dynamic(() => import("../components/GoogleMapsContext").then(mod => mod.GoogleMapsProvider), { ssr: false });

export default function CreateMapPage() {
  const router = useRouter();

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
            {/* User info will be managed by the component */}
          </div>
        </nav>
        <div style={contentStyle}>
          <CreateMap />
        </div>
        <ToastContainer />
      </div>
    </GoogleMapsProvider>
  );
}
