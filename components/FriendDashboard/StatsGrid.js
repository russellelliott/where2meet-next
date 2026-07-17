import React from 'react';
import {
  Box,
  Grid,
  Typography,
  Chip,
  Paper,
} from '@mui/material';
import { Users, Car, Clock, Calendar } from 'lucide-react';

/**
 * StatsGrid Component
 * Display summary statistics for the friends dashboard
 * @param {object} props
 * @param {Array} props.friends - Array of friend objects
 * @param {Array} props.plannedHangouts - Array of planned hangout objects
 */
export default function StatsGrid({ friends, plannedHangouts }) {
  const totalFriends = friends.length;

  // Logistics
  const canDriveCount = friends.filter((f) => f.logistics?.canDrive).length;
  const needsRideCount = friends.filter((f) => f.logistics?.pickupRequired).length;

  // Contact Staleness (relative to July 12, 2026)
  const CURRENT_TIME = new Date('2026-07-12T16:00:00Z');

  const getDaysSinceContact = (dateStr) => {
    const lastDate = new Date(dateStr);
    const diffTime = CURRENT_TIME.getTime() - lastDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return isNaN(diffDays) ? 0 : diffDays;
   };

  const freshCount = friends.filter((f) => getDaysSinceContact(f.contact?.lastContactDate) <= 7).length;
  const staleCount = friends.filter((f) => {
    const days = getDaysSinceContact(f.contact?.lastContactDate);
    return days > 7 && days <= 30;
   }).length;
  const overdueCount = friends.filter((f) => getDaysSinceContact(f.contact?.lastContactDate) > 30).length;

  return (
     <Grid container spacing={2} sx={{ mb: 2 }} id="stats-grid">
       {/* Stat 1: Total Friends */}
       <Grid item xs={6} md={3}>
         <Paper
           sx={{
             p: 2.5,
             display: 'flex',
             alignItems: 'center',
             gap: 2,
             borderRadius: 2,
             boxShadow: 1,
           }}
         >
           <Box
             sx={{
               p: 1.5,
               backgroundColor: '#F9F8F6',
               borderRadius: 2,
               border: '1px solid #EBE9E2',
               color: '#666666',
               display: 'flex',
               alignItems: 'center',
             }}
           >
             <Users size={20} />
           </Box>
           <Box>
             <Typography
               variant="caption"
               sx={{
                 display: 'block',
                 textTransform: 'uppercase',
                 fontFamily: 'monospace',
                 color: '#7D7B6D',
                 letterSpacing: '0.5px',
                 fontWeight: 600,
               }}
             >
               Total Friends
             </Typography>
             <Typography
               variant="h5"
               sx={{
                 fontWeight: 600,
                 color: '#2D2D20',
               }}
             >
               {totalFriends}
             </Typography>
           </Box>
         </Paper>
       </Grid>

       {/* Stat 2: Logistics */}
       <Grid item xs={6} md={3}>
         <Paper
           sx={{
             p: 2.5,
             display: 'flex',
             alignItems: 'center',
             gap: 2,
             borderRadius: 2,
             boxShadow: 1,
           }}
         >
           <Box
             sx={{
               p: 1.5,
               backgroundColor: '#F9F8F6',
               borderRadius: 2,
               border: '1px solid #EBE9E2',
               color: '#CC7A5C',
               display: 'flex',
               alignItems: 'center',
             }}
           >
             <Car size={20} />
           </Box>
           <Box>
             <Typography
               variant="caption"
               sx={{
                 display: 'block',
                 textTransform: 'uppercase',
                 fontFamily: 'monospace',
                 color: '#7D7B6D',
                 letterSpacing: '0.5px',
                 fontWeight: 600,
               }}
             >
               Ride Logistics
             </Typography>
             <Typography
               variant="body2"
               sx={{
                 fontSize: '12px',
                 fontWeight: 500,
                 color: '#2D2D20',
               }}
             >
               🚗 {canDriveCount} Drivers
             </Typography>
             <Typography
               variant="body2"
               sx={{
                 fontSize: '12px',
                 fontWeight: 500,
                 color: '#CC7A5C',
               }}
             >
               🚌 {needsRideCount} Need Rides
             </Typography>
           </Box>
         </Paper>
       </Grid>

       {/* Stat 3: Staleness */}
       <Grid item xs={6} md={3}>
         <Paper
           sx={{
             p: 2.5,
             display: 'flex',
             alignItems: 'center',
             gap: 1.5,
             borderRadius: 2,
             boxShadow: 1,
             flexWrap: 'wrap',
           }}
         >
           <Box
             sx={{
               p: 1.5,
               backgroundColor: '#F9F8F6',
               borderRadius: 2,
               border: '1px solid #EBE9E2',
               color: '#25D366',
               display: 'flex',
               alignItems: 'center',
             }}
           >
             <Clock size={20} />
           </Box>
           <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
             <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: '11px', color: '#7D7B6D', fontWeight: 600, display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
               Contact Recency
             </Typography>
             <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
               <Chip
                 label={`🟢 ${freshCount} Fresh`}
                 size="small"
                 sx={{
                   height: 20,
                   fontSize: '10px',
                   backgroundColor: '#e8f5e9',
                   color: '#1b5e20',
                   fontWeight: 600,
                   borderColor: '#c8e6c9',
                 }}
               />
               <Chip
                 label={`🟡 ${staleCount} Stale`}
                 size="small"
                 sx={{
                   height: 20,
                   fontSize: '10px',
                   backgroundColor: '#fff8e1',
                   color: '#f57f17',
                   fontWeight: 600,
                   borderColor: '#ffecb3',
                 }}
               />
               <Chip
                 label={`🔴 ${overdueCount} Overdue`}
                 size="small"
                 sx={{
                   height: 20,
                   fontSize: '10px',
                   backgroundColor: '#ffebee',
                   color: '#c62828',
                   fontWeight: 600,
                   borderColor: '#ffcdd2',
                 }}
               />
             </Box>
           </Box>
         </Paper>
       </Grid>

       {/* Stat 4: Commitments */}
       <Grid item xs={6} md={3}>
         <Paper
           sx={{
             p: 2.5,
             display: 'flex',
             alignItems: 'center',
             gap: 2,
             borderRadius: 2,
             boxShadow: 1,
           }}
         >
           <Box
             sx={{
               p: 1.5,
               backgroundColor: '#F9F8F6',
               borderRadius: 2,
               border: '1px solid #EBE9E2',
               color: '#5865F2',
               display: 'flex',
               alignItems: 'center',
             }}
           >
             <Calendar size={20} />
           </Box>
           <Box>
             <Typography
               variant="caption"
               sx={{
                 display: 'block',
                 textTransform: 'uppercase',
                 fontFamily: 'monospace',
                 color: '#7D7B6D',
                 letterSpacing: '0.5px',
                 fontWeight: 600,
               }}
             >
               Upcoming Events
             </Typography>
             <Typography
               variant="h5"
               sx={{
                 fontWeight: 600,
                 color: '#2D2D20',
               }}
             >
               {plannedHangouts.length}
             </Typography>
             <Typography
               variant="caption"
               sx={{
                 display: 'block',
                 color: '#7D7B6D',
                 fontSize: '10px',
               }}
             >
               Pending syncs
             </Typography>
           </Box>
         </Paper>
       </Grid>
     </Grid>
   );
 }
