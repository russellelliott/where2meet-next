import React from 'react';
import dayjs from 'dayjs';
import {
  Box,
  Typography,
  Button,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Divider,
  Paper,
} from '@mui/material';

/**
 * Resolve city name from POI ID by looking up the POI data
 * @param {string} poiId - The POI document ID
 * @param {Array} pois - Array of user POIs with location data
 * @returns {string|null} City name or null
 */
function getCityFromPoi(poiId, pois) {
  if (!poiId || !pois || !Array.isArray(pois)) return null;

  // Search in the pois array for a matching POI
  const poi = pois.find((p) => p.id === poiId);
  if (poi?.location?.city) return poi.location.city;
  if (poi?.location?.address) return poi.location.address;

  return null;
}

/**
 * HangoutList - Display all hangouts with completion button for passed dates
 * @param {object} props
 * @param {Array} props.hangouts - Array of hangout objects
 * @param {Array} props.friends - Array of friend objects (for resolving friend names)
 * @param {Function} props.onCompleteHangout - Callback when completing a hangout
 * @param {Array} props.pois - Array of user POIs (for resolving city from poiId)
 */
export default function HangoutList({ hangouts = [], friends = [], onCompleteHangout, pois = [] }) {
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
          const city = getCityFromPoi(hangout.poiId, pois);

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
                        {hangout.title || 'Unnamed Hangout'}
                      </Typography>
                      <Chip
                        label={hangout.type || 'physical'}
                        size="small"
                        sx={{
                          backgroundColor: hangout.type === 'virtual' ? '#5865F210' : '#25D36610',
                          color: hangout.type === 'virtual' ? '#5865F2' : '#1e8544',
                          fontFamily: 'monospace',
                          fontSize: '9px',
                          fontWeight: 700,
                          height: 20,
                          border: `1px solid ${hangout.type === 'virtual' ? '#5865F230' : '#25D36630'}`,
                        }}
                      />
                    </Box>
                  }
                  secondary={
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mt: 0.5 }}>
                      <Typography variant="caption" color="text.secondary">
                        {dayjs(hangout.datetime).format('MMM D, YYYY h:mm A')}
                      </Typography>
                      {city && (
                        <Typography variant="caption" color="text.secondary">
                          📍 {city}
                        </Typography>
                      )}
                      {hangout.description && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                          {hangout.description}
                        </Typography>
                      )}
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