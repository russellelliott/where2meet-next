import React from 'react';
import dayjs from 'dayjs';
import {
  Box,
  Typography,
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Divider,
  Paper,
} from '@mui/material';

/**
 * HangoutList - Display all hangouts with completion button for passed dates
 * @param {object} props
 * @param {Array} props.hangouts - Array of hangout objects
 * @param {Array} props.friends - Array of friend objects (for resolving friend names)
 * @param {Function} props.onCompleteHangout - Callback when completing a hangout
 */
export default function HangoutList({ hangouts = [], friends = [], onCompleteHangout }) {
  if (!hangouts || hangouts.length === 0) {
    return (
      <Box sx={{ p: 2, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          No hangouts scheduled yet.
         </Typography>
       </Box>
     );
   }

  const isHangoutPassed = (datetime) => {
    return dayjs(datetime).isBefore(dayjs());
  };

  const getFriendNamesByIds = (friendIds) => {
    if (!friendIds || !Array.isArray(friendIds)) return '';
    return friendIds
      .map((id) => {
        const friend = friends.find((f) => f.id === id);
        return friend ? friend.name : null;
       })
      .filter(Boolean)
      .join(', ');
  };

  return (
    <Box sx={{ width: '100%' }}>
       <Typography variant="subtitle2" gutterBottom>
         All Hangouts
       </Typography>
       <List dense sx={{ width: '100%', maxWidth: '100%' }}>
         {hangouts.map((hangout) => {
           const passed = isHangoutPassed(hangout.datetime);
           const friendNames = getFriendNamesByIds(hangout.friendIds);

           return (
             <React.Fragment key={hangout.id}>
               <ListItem
                 sx={{
                   px: 0,
                   bgcolor: passed ? 'action.hover' : 'background.default',
                   borderRadius: 1,
                   mb: 0.5,
                 }}
               >
                 <ListItemText
                   primary={
                     <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                       <Typography variant="body2" fontWeight="medium">
                         {hangout.description || 'Unnamed Hangout'}
                       </Typography>
                       <Typography variant="caption" color="text.secondary">
                         ({hangout.type})
                       </Typography>
                     </Box>
                   }
                   secondary={
                     <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mt: 0.5 }}>
                       <Typography variant="caption" color="text.secondary">
                         {dayjs(hangout.datetime).format('MMM D, YYYY h:mm A')}
                       </Typography>
                       {friendNames && (
                         <Typography variant="caption" color="text.secondary">
                           Friends: {friendNames}
                         </Typography>
                       )}
                     </Box>
                   }
                 />
                 <ListItemSecondaryAction>
                   {passed && (
                     <Button
                       variant="outlined"
                       size="small"
                       onClick={() => onCompleteHangout(hangout.id)}
                       sx={{ textTransform: 'none', fontSize: '10px' }}
                     >
                       Mark Complete
                     </Button>
                   )}
                 </ListItemSecondaryAction>
               </ListItem>
               <Divider />
             </React.Fragment>
           );
         })}
       </List>
     </Box>
   );
}