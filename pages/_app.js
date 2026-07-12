import "../styles/App.css";
import dynamic from "next/dynamic";
import Navbar from "../components/Navbar";

const GoogleMapsProvider = dynamic(() => import("../components/GoogleMapsContext").then(mod => mod.GoogleMapsProvider), { ssr: false });

export default function App({ Component, pageProps }) {
  return (
    <GoogleMapsProvider>
      <div className="App">
        <Navbar />
        <div style={{ marginTop: '60px' }}>
          <Component {...pageProps} />
        </div>
      </div>
    </GoogleMapsProvider>
  );
}
