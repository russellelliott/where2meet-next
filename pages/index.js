import React from "react";
import dynamic from "next/dynamic";
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const MasterMap = dynamic(() => import("../components/MasterMap"), { ssr: false });

export default function Home() {
  return (
      <div>
        <div style={{ marginTop: '60px', height: 'calc(100vh - 70px)', overflow: 'hidden' }}>
          <MasterMap />
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
     </div>
   );
}
