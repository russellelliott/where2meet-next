import React from "react";
import dynamic from "next/dynamic";
import { ToastContainer } from 'react-toastify';

const CreateMap = dynamic(() => import("../components/CreateMap"), { ssr: false });

export default function CreateMapPage() {
  return (
       <div>
         <CreateMap />
         <ToastContainer />
       </div>
   );
}
