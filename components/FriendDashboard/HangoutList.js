import React, { useState } from 'react';
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
  ListItemButton,
  Divider,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
} from '@mui/material';
import { MapPin, Pencil, Trash2 } from 'lucide-react';

/**
 * Helper to safely convert Firestore Timestamp or ISO string to a JS Date
 * @param {*} val - Firestore Timestamp object or ISO string
 * @returns {Date|null}
 */
function safeToTimestamp(val) {
  if (!val) return null;
  // Handle Firestore Timestamp objects (SDK v9 snapshot.data())
  if (val?.toDate && typeof val.toDate === 'function') {
    return val.toDate();
  }
  // Handle native Date or ISO string
  return new Date(val);
}

/**
 * Format datetime for display, safely handling Firestore Timestamp objects
 * @param {*} val - Firestore Timestamp object or ISO string
 * @returns {string}
 */
function formatDatetime(val) {
  const d = safeToTimestamp(val);
  if (!d || isNaN(d.getTime())) return '';
  return dayjs(d).format('MMM D, YYYY h:mm A');
}

/**
  * Resolve POI data by ID from the pois array
  * @param {string} poiId - The POI document ID
  * @param {Array} pois - Array of user POIs with location data
  * @returns {object|null} POI object or null
  */
function getPoiById(poiId, pois) {
  if (!poiId || !pois || !Array.isArray(pois)) return null;
  return pois.find((p) => p.id === poiId) || null;
}

/**
  * PoiInfoDialog - Small dialog showing POI name and address
  * @param {object} props
  * @param {boolean} props.open - Whether dialog is open
  * @param {Function} props.onClose - Callback when closing
  * @param {object} props.poi - POI object with name and location
  */
function PoiInfoDialog({ open, onClose, poi }) {
  if (!open || !poi) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 2 } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <MapPin size={16} color="#5A5A40" />
        Location Details
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <div>
            <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mb: 0.5 }}>
              Name
            </Typography>
            <Typography variant="body2" fontWeight="medium">
              {poi.name || 'Unnamed Location'}
            </Typography>
          </div>
          <div>
            <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mb: 0.5 }}>
              Address
            </Typography>
            <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
              {poi.location?.address || 'No address available'}
            </Typography>
          </div>
          {(poi.location?.lat || poi.location?.lng) && (
            <div>
              <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mb: 0.5 }}>
                Coordinates
              </Typography>
              <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                {poi.location?.lat?.toFixed(6) || 'N/A'}, {poi.location?.lng?.toFixed(6) || 'N/A'}
              </Typography>
            </div>
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button onClick={onClose} variant="outlined">Close</Button>
      </DialogActions>
    </Dialog>
  );
}

/**
  * HangoutList - Display all hangouts with completion button for passed dates
  * @param {object} props
  * @param {Array} props.hangouts - Array of hangout objects
  * @param {Array} props.friends - Array of friend objects (for resolving friend names)
  * @param {Function} props.onCompleteHangout - Callback when completing a hangout
  * @param {Array} props.pois - Array of user POIs (for resolving city from poiId)
  * @param {Function} props.onEditHangout - Callback when editing a hangout
  * @param {Function} props.onDeleteHangout - Callback when deleting a hangout
  */
export default function HangoutList({
  hangouts = [],
  friends = [],
  groups = [],
  onCompleteHangout,
  pois = [],
  onEditHangout,
  onDeleteHangout,
}) {
  const [selectedPoiForInfo, setSelectedPoiForInfo] = useState(null);
  const [poiDialogOpen, setPoiDialogOpen] = useState(false);

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
    const d = safeToTimestamp(datetime);
    if (!d || isNaN(d.getTime())) return false;
    return dayjs(d).isBefore(dayjs());
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

   const getPoiById = (poiId, pois) => {
     if (!poiId || !pois || !Array.isArray(pois)) return null;
     return pois.find((p) => p.id === poiId) || null;
   };

  const handlePoiBadgeClick = (poi) => {
    setSelectedPoiForInfo(poi);
    setPoiDialogOpen(true);
  };

  const handlePoiDialogClose = () => {
    setPoiDialogOpen(false);
    setSelectedPoiForInfo(null);
  };

  return (
    <Box sx={{ width: '100%' }}>
      <Typography variant="subtitle2" gutterBottom>
        All Hangouts
      </Typography>
      <List dense sx={{ width: '100%', maxWidth: '100%' }}>
        {hangouts.map((hangout) => {
         const passed = isHangoutPassed(hangout.datetime);
           const friendNames = hangout.friendIds
             ? getFriendNamesByIds(hangout.friendIds)
             : '';
           // Support both legacy poiId and new locationPoiId field
           const poi = getPoiById(hangout.locationPoiId || hangout.poiId, pois);
           const address = poi?.location?.address || null;

          return (
            <React.Fragment key={hangout.id}>
              <ListItem
                disablePadding
                sx={{
                  px: 0,
                  bgcolor: passed ? 'action.hover' : 'background.default',
                  borderRadius: 1,
                  mb: 0.5,
                }}
              >
                <ListItemButton
                  onClick={() => {}}
                  sx={{
                    px: 2,
                    py: 1,
                  }}
                >
                  <ListItemText
                   primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        {/* Title - fetched from Firestore */}
                        <Typography variant="body2" fontWeight="medium">
                          {hangout.title || 'Untitled Hangout'}
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
                        {poi && (
                          <Chip
                            icon={<MapPin size={14} color="#FFFFFF" />}
                            label={poi.name || poi.location?.address || 'Location'}
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePoiBadgeClick(poi);
                            }}
                            sx={{
                              backgroundColor: '#5A5A40',
                              color: '#FFFFFF',
                              fontFamily: 'monospace',
                              fontSize: '9px',
                              fontWeight: 600,
                              height: 20,
                              cursor: 'pointer',
                              '&:hover': {
                                backgroundColor: '#434330',
                              },
                            }}
                          />
                        )}
                      </Box>
                    }
                    secondary={
                       <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mt: 0.5 }}>
                          {/* Properly formatted datetime from hangout data */}
                        <Typography variant="caption" color="text.secondary">
                            {formatDatetime(hangout.datetime)}
                         </Typography>
                        {hangout.description && (
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                            {hangout.description}
                          </Typography>
                        )}
                        {address && (
                          <Typography variant="caption" color="text.secondary">
                            📍 {address}
                          </Typography>
                        )}
                         {friendNames && (
                            <Typography variant="caption" color="text.secondary">
                              With: {friendNames}
                            </Typography>
                          )}
                        {hangout.groupId && (
                             <Typography variant="caption" color="text.secondary">
                              Group: {groups?.find((g) => g.id === hangout.groupId)?.name || 'Unknown Group'}
                             </Typography>
                           )}
                      </Box>
                    }
                  />
                </ListItemButton>
                <ListItemSecondaryAction sx={{ mr: 1 }}>
                  {/* Edit button */}
                  {onEditHangout && (
                    <IconButton
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditHangout(hangout);
                      }}
                      size="small"
                      sx={{ color: '#9B988C', mr: 0.5, '&:hover': { color: '#5A5A40', backgroundColor: '#FBFBF9' } }}
                      title="Edit Hangout"
                    >
                      <Pencil size={14} />
                    </IconButton>
                  )}
                  {/* Delete button */}
                  {onDeleteHangout && (
                    <IconButton
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteHangout(hangout.id);
                      }}
                      size="small"
                      sx={{ color: '#9B988C', '&:hover': { color: '#CC7A5C', backgroundColor: '#FBFBF9' } }}
                      title="Delete Hangout"
                    >
                      <Trash2 size={14} />
                    </IconButton>
                  )}
                  {passed && onEditHangout && (
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCompleteHangout(hangout.id);
                      }}
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

      {/* POI Information Dialog */}
      <PoiInfoDialog
        open={poiDialogOpen}
        onClose={handlePoiDialogClose}
        poi={selectedPoiForInfo}
      />
    </Box>
  );
}