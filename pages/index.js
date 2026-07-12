import React from "react";
import dynamic from "next/dynamic";
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const MasterMap = dynamic(() => import("../components/MasterMap"), { ssr: false });

export default function Home() {
  return (
     <div>
       <MasterMap />
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
