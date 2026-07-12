import React from "react";
import dynamic from "next/dynamic";
import { ToastContainer } from 'react-toastify';

const MyMaps = dynamic(() => import("../components/MyMaps"), { ssr: false });

export default function MyMapsPage() {
  return (
      <div>
        <MyMaps />
        <ToastContainer />
      </div>
   );
}
