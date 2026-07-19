import React, { useState, useCallback } from 'react';
import dayjs from 'dayjs';
import { GoogleMap, Marker } from '@react-google-maps/api';
import {
  Box,
  Typography,
  Button,
  TextField,
  Paper,
  IconButton,
  Chip,
  MenuItem,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  CircularProgress,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import {
  Calendar,
  Users,
  Clock,
  X,
  Flame,
  MapPin,
  ClipboardList,
  Video,
  Search,
  Pencil,
  Trash2,
} from 'lucide-react';
import { createPoiFromCoordinates } from '../../lib/poiService';
import { auth, db } from '../../firebaseConfig';
import { collection, getDocs } from 'firebase/firestore';

/* ========================================================================
 * SimpleMapPOIPicker — Top-level component (defined OUTSIDE HangoutScheduler
 * to prevent re-creation / re-mount issues on every parent render).
 * Matches the same pattern used in FriendForm.js.
 * ======================================================================== */
function SimpleMapPOIPicker({ onClose, onPoiCreated }) {
  const [searchAddr, setSearchAddr] = useState('');
  const [selectedCoords, setSelectedCoords] = useState(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  React.useEffect(() => {
    if (typeof window.google !== 'undefined' && window.google.maps) {
      setMapLoaded(true);
      return;
    }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || ''}&libraries=places`;
    script.async = true;
    script.onload = () => setMapLoaded(true);
    document.head.appendChild(script);
    return () => { document.head.removeChild(script); };
  }, []);

  const handleSearch = () => {
    if (!window.google?.maps?.Geocoder) return;
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ address: searchAddr }, (results, status) => {
      if (status === 'OK' && results[0]) {
        const loc = results[0].geometry.location;
        setSelectedCoords({ lat: loc.lat(), lng: loc.lng() });
      } else {
        alert('Could not find that address.');
      }
    });
  };

  const handleConfirm = () => {
    if (!selectedCoords) return;
    onPoiCreated(selectedCoords);
    onClose();
  };

  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="subtitle2" gutterBottom>Create New Location</Typography>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
        Click the button below to open the map and create a new location.
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Search address or place name"
          value={searchAddr}
          onChange={(e) => setSearchAddr(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
        />
        <Button variant="outlined" onClick={handleSearch}>Search</Button>
      </Box>

      <Box sx={{ width: '100%', height: 300, borderRadius: 2, overflow: 'hidden', position: 'relative' }}>
        {mapLoaded && window.google?.maps ? (
          <GoogleMap
            center={selectedCoords || { lat: 37.7749, lng: -122.4194 }}
            zoom={12}
            mapTypeId="roadmap"
            options={{ streetViewControl: false, mapTypeControl: false }}
          >
            {selectedCoords && (
              <Marker
                key="selected-marker"
                position={selectedCoords}
                draggable={true}
                onDragend={(e) => {
                  const loc = e.latLng?.toJSON();
                  if (loc) setSelectedCoords({ lat: loc.lat, lng: loc.lng });
                }}
              />
            )}
          </GoogleMap>
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            Loading map...
          </Box>
        )}
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleConfirm} disabled={!selectedCoords} autoFocus>
          Use This Location
        </Button>
      </Box>
    </Box>
  );
}

/* ========================================================================
 * SchedulingFormDialog — Extracted to top-level so React keeps a stable
 * component reference across parent re-renders.  All state / callbacks are
 * passed in via props (the same pattern that works in FriendForm.js).
 * ======================================================================== */
function SchedulingFormDialog(props) {
  const {
    isScheduling, setIsScheduling,
    hangoutTitle, setHangoutTitle,
    selectedGroupId, setSelectedGroupId,
    hangoutType, setHangoutType,
    datetime, setDatetime,
    details, setDetails,
    selectedPoiId, setSelectedPoiId,
    showPoiPicker, setShowPoiPicker,
    existingPOIs,
    loadingPOIs,
    poiSearchQuery, setPoiSearchQuery,
    loadExistingPOIs,
    friends,
    groups,
    customAttendeeIds, setCustomAttendeeIds,
    onSubmit: formOnSubmit,
    handleGroupChange,
    toggleAttendee,
    openPoiPicker,
    handlePoiSearchChange,
    handleSelectPoi,
    confirmLocationSelection,
    cancelLocationSelection,
    getPoiNameById,
    getPoiAddressById,
    isEditingHangoutMode = false,
    editingHangout = null,
    onSaveHangout = null,
    userPois = [],
    } = props;

  const handleSubmit = useCallback((e) => {
    e.preventDefault();

    if (isEditingHangoutMode && onSaveHangout && editingHangout) {
      // Update existing hangout - only include fields that have values
      const hangoutData = {
        title: hangoutTitle.trim() || 'Untitled Hangout',
        type: hangoutType,
        datetime: new Date(datetime).toISOString(),
        friendIds: customAttendeeIds.length > 0 ? [...customAttendeeIds] : [],
       };

      // Only add poiId if selected
      if (selectedPoiId) {
        hangoutData.poiId = selectedPoiId;
       }

      // Only add description if non-empty
      if (details.trim()) {
        hangoutData.description = details.trim();
       }

      // Only add groupId if selected
      if (selectedGroupId) {
        hangoutData.groupId = selectedGroupId;
       }

      onSaveHangout(hangoutData).then(() => {
        setHangoutTitle('');
        setSelectedGroupId('');
        setCustomAttendeeIds([]);
        setSelectedPoiId(null);
        setDetails('');
        setIsScheduling(false);
       }).catch((err) => {
        console.error('Error updating hangout:', err);
       });
    } else if (!isEditingHangoutMode && formOnSubmit) {
      // Create new hangout (original behavior)
      if (!hangoutTitle.trim() || customAttendeeIds.length === 0) {
        return;
      }
      const hangoutData = {
        title: hangoutTitle.trim(),
        poiId: selectedPoiId || null,
        type: hangoutType,
        datetime: new Date(datetime).toISOString(),
        friendIds: customAttendeeIds.length > 0 ? [...customAttendeeIds] : [],
      };
       // Only add optional fields if they have actual values
      if (details.trim()) {
        hangoutData.description = details.trim();
       }
      if (selectedGroupId) {
        hangoutData.groupId = selectedGroupId;
       }
      formOnSubmit(e);
    }
  }, [isEditingHangoutMode, onSaveHangout, editingHangout, hangoutTitle, selectedPoiId, hangoutType, datetime, details, customAttendeeIds, selectedGroupId, formOnSubmit]);

  return (
    <Dialog
      open={isScheduling}
      onClose={() => setIsScheduling(false)}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3, backgroundColor: '#FBFBF9' } }}
    >
      <DialogTitle sx={{ pb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Calendar size={18} color="#CC7A5C" />
        {isEditingHangoutMode ? 'Edit Hangout' : 'Schedule Group Hangout'}
      </DialogTitle>

      <DialogContent dividers>
        <form id="scheduleHangoutForm" onSubmit={handleSubmit}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
            {/* Left: event details */}
            <Box>
              <TextField
                fullWidth
                size="small"
                label="Hangout Title"
                placeholder="E.g. Sunday Board Game Run"
                value={hangoutTitle}
                onChange={(e) => setHangoutTitle(e.target.value)}
                required={!isEditingHangoutMode}
                sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />

              <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                <InputLabel>Pre-set Group</InputLabel>
                <Select
                  value={selectedGroupId}
                  onChange={(e) => handleGroupChange(e.target.value)}
                  label="Pre-set Group"
                >
                  <MenuItem value="">-- Custom (Select Friends Below) --</MenuItem>
                  {groups.map((g) => (
                    <MenuItem key={g.id} value={g.id}>{g.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mb: 2 }}>
                {/* Type toggle using MUI ToggleButtonGroup */}
                <Box>
                  <Typography variant="caption" sx={{ display: 'block', fontFamily: 'monospace', fontSize: '9px', textTransform: 'uppercase', fontWeight: 700, color: '#7D7B6D', mb: 0.5 }}>
                    Type
                  </Typography>
                  <ToggleButtonGroup
                    value={hangoutType}
                    exclusive
                    onChange={(e, newType) => newType && setHangoutType(newType)}
                    sx={{
                      width: '100%',
                      borderRadius: 2,
                      '& .MuiToggleButton-root': {
                        fontSize: '11px',
                        fontWeight: 600,
                        fontFamily: 'monospace',
                        py: 0.75,
                        px: 1,
                        border: '1px solid #E0DED7',
                        borderRadius: 2,
                        transition: 'all 0.2s ease',
                      },
                      '& .Mui-selected': {
                        backgroundColor: '#5A5A40',
                        color: '#FFFFFF',
                      },
                      '& .MuiToggleButton-root:first-of-type': {
                        borderRadius: hangoutType === 'physical' ? '2px 0 0 2px' : 2,
                      },
                      '& .MuiToggleButton-root:last-of-type': {
                        borderRadius: hangoutType === 'virtual' ? '0 2px 2px 0' : 2,
                      },
                    }}
                  >
                    <ToggleButton value="physical">Physical</ToggleButton>
                    <ToggleButton value="virtual">Virtual</ToggleButton>
                  </ToggleButtonGroup>
                </Box>

                {/* Date & time */}
                <Box>
                  <Typography variant="caption" sx={{ display: 'block', fontFamily: 'monospace', fontSize: '9px', textTransform: 'uppercase', fontWeight: 700, color: '#7D7B6D', mb: 0.5 }}>
                    Date & Time
                  </Typography>
                  <TextField
                    fullWidth
                    type="datetime-local"
                    value={datetime}
                    onChange={(e) => setDatetime(e.target.value)}
                    size="small"
                    InputLabelProps={{ shrink: true }}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                  />
                </Box>
              </Box>

              {/* Location selection button - only for physical type */}
              {hangoutType === 'physical' && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="caption" sx={{ display: 'block', fontFamily: 'monospace', fontSize: '9px', textTransform: 'uppercase', fontWeight: 700, color: '#7D7B6D', mb: 0.5 }}>
                    Destination
                  </Typography>
                    <Button
                    fullWidth
                    variant="outlined"
                    onClick={() => openPoiPicker(editingHangout?.poiId || null)}
                    startIcon={<MapPin size={14} />}
                    sx={{
                      textTransform: 'none',
                      justifyContent: 'flex-start',
                      borderRadius: 2,
                    }}
                    >
                      {selectedPoiId
                        ? `📍 ${getPoiNameById(selectedPoiId) || getPoiAddressById(selectedPoiId) || 'Loading...'}`
                        : editingHangout?.poiId && !selectedPoiId
                          ? `📍 ${getPoiAddressById(editingHangout.poiId) || getPoiNameById(editingHangout.poiId) || '+ Select Location on Map'}`
                          : '+ Select Location on Map'}
                    </Button>
                </Box>
              )}

              <TextField
                fullWidth
                size="small"
                multiline
                rows={2}
                label="Planning Notes / Logistics details"
                placeholder="Need food recommendations, ride-share configurations..."
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Box>

            {/* Right: attendees */}
            <Box>
              <Typography variant="caption" sx={{ display: 'block', fontFamily: 'monospace', fontSize: '9px', textTransform: 'uppercase', fontWeight: 700, color: '#7D7B6D', mb: 1 }}>
                Attendees (Customize Selection)
              </Typography>
               <Paper variant="outlined" sx={{ p: 1.5, maxHeight: 230, overflowY: 'auto', borderRadius: 2 }}>
                 {friends.map((f) => {
                   const isChecked = customAttendeeIds.includes(f.id);
                   return (
                      <Box key={f.id} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 0.5, px: 1, borderRadius: 1, cursor: 'pointer', '&:hover': { backgroundColor: '#FBFBF9' } }}>
                        <Typography variant="body2" sx={{ fontSize: '12px' }}>{f.name}{f.location?.city ? ` · ${f.location.city}` : ''}</Typography>
                        <input type="checkbox" checked={isChecked} onChange={() => toggleAttendee(f.id)} style={{ accentColor: '#CC7A5C' }} />
                      </Box>
                    );
                  })}
                </Paper>
              <Typography variant="caption" sx={{ display: 'block', fontStyle: 'italic', color: '#7D7B6D', mt: 1, fontSize: '10px' }}>
                Add or remove specific individuals for this hangout commitment.
              </Typography>
            </Box>
          </Box>

          <Divider sx={{ my: 2 }} />

          {/* POI Picker Dialog — nested inside SchedulingFormDialog so it appears on top */}
          {showPoiPicker && hangoutType === 'physical' && (
            <Dialog
              open={true}
              onClose={cancelLocationSelection}
              maxWidth="md"
              fullWidth
              PaperProps={{ sx: { borderRadius: 2 } }}
            >
              <DialogTitle>Select or Create a Location</DialogTitle>

              {/* Search bar */}
              <DialogContent>
                <Box sx={{ mb: 2 }}>
                  <TextField
                    fullWidth
                    size="small"
                    placeholder="Search locations by name, address, or city..."
                    value={poiSearchQuery}
                    onChange={handlePoiSearchChange}
                    InputProps={{
                      startAdornment: (
                        <Box sx={{ mr: 1, display: 'flex', alignItems: 'center' }}>
                          <Search size={14} color="#9B988C" />
                        </Box>
                      ),
                    }}
                  />
                </Box>

                {/* Existing POIs list */}
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Existing Locations
                  </Typography>
                  {loadingPOIs ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                      <CircularProgress size={24} />
                    </Box>
                  ) : (
                    <Box sx={{ maxHeight: 200, overflowY: 'auto' }}>
                       {existingPOIs.map((poi) => {
                          // Find which friends have this POI in their placeIdeas
                          const friendsWithPoi = (friends || []).filter(f =>
                             (f.placeIdeas || []).includes(poi.id)
                           );
                          // Find which groups have this POI in their placeIdeas
                          const groupsWithPoi = (groups || []).filter(g =>
                             (g.placeIdeas || []).includes(poi.id)
                           );
                          return (
                             <Box
                              key={poi.id}
                              onClick={() => handleSelectPoi(poi.id)}
                              sx={{
                                p: 1.5,
                                cursor: 'pointer',
                                borderRadius: 1,
                                mb: 0.5,
                                bgcolor: selectedPoiId === poi.id ? 'action.selected' : 'transparent',
                                '&:hover': { bgcolor: 'action.hover' },
                               }}
                              >
                               <Typography variant="body2">{poi.name}</Typography>
                               <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                 {poi.location?.address || `${poi.location?.lat}, ${poi.location?.lng}`}
                               </Typography>
                               {(friendsWithPoi.length > 0 || groupsWithPoi.length > 0) && (
                                 <Box sx={{ mt: 0.5, ml: 1 }}>
                                   {friendsWithPoi.length > 0 && (
                                     <Typography variant="caption" sx={{ display: 'block', color: '#7D7B6D' }}>
                                       📌 {friendsWithPoi.map(f => f.name).join(', ')}
                                     </Typography>
                                   )}
                                   {groupsWithPoi.length > 0 && (
                                     <Typography variant="caption" sx={{ display: 'block', color: '#7D7B6D' }}>
                                       👥 {groupsWithPoi.map(g => g.name).join(', ')}
                                     </Typography>
                                   )}
                                 </Box>
                               )}
                              </Box>
                            );
                         })}
                      {existingPOIs.length === 0 && (
                        <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                          No locations found. Search above or create a new one below.
                        </Typography>
                      )}
                    </Box>
                  )}
                </Box>

                {/* Create New via Map component */}
                <Box sx={{ mt: 0, borderTop: '1px solid #e0e0e0', pt: 2 }}>
                  <SimpleMapPOIPicker key={`poi-picker-schedule-${selectedPoiId}`} onClose={cancelLocationSelection} onPoiCreated={(coords) => {
                    setSelectedPoiId(null);
                    cancelLocationSelection();
                  }} />
                </Box>
              </DialogContent>

              <DialogActions sx={{ p: 2, gap: 1 }}>
                <Button onClick={cancelLocationSelection}>Cancel</Button>
                {selectedPoiId && (
                  <Button variant="contained" onClick={confirmLocationSelection} autoFocus>
                    Use Selected Location
                  </Button>
                )}
              </DialogActions>
            </Dialog>
          )}
        </form>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        <Button onClick={() => setIsScheduling(false)}>Cancel</Button>
        <Button type="submit" form="scheduleHangoutForm" variant="contained" sx={{ backgroundColor: '#5A5A40', '&:hover': { backgroundColor: '#434330' } }}>
          {isEditingHangoutMode ? 'Save Hangout' : 'Create Hangout'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/* ========================================================================
 * GroupCreationForm — Extracted to top-level for the same stability reason.
 * ======================================================================== */
function GroupCreationForm(props) {
  const {
    isCreatingGroup, setIsCreatingGroup,
    groupName, setGroupName,
    groupNotes, setGroupNotes,
    groupMemberIds, setGroupMemberIds,
    friends,
    onSubmit: formOnSubmit,
    toggleGroupMember,
    editingGroup = null,
  } = props;

  // Populate form when editing a group
  React.useEffect(() => {
    if (editingGroup) {
      setGroupName(editingGroup.name || '');
      setGroupNotes(editingGroup.planning?.notes || editingGroup.notes || '');
      setGroupMemberIds(editingGroup.memberIds || []);
      setIsCreatingGroup(true);
    }
  }, [editingGroup]);

  return (
    <Dialog
      open={isCreatingGroup}
      onClose={() => {
        if (!editingGroup) {
          setIsCreatingGroup(false);
          setGroupName('');
          setGroupNotes('');
          setGroupMemberIds([]);
        } else {
          setIsCreatingGroup(false);
        }
      }}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3, backgroundColor: '#FBFBF9' } }}
    >
      <DialogTitle sx={{ pb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Users size={18} color="#CC7A5C" />
        {editingGroup ? 'Edit Group' : 'Create New Friend Group'}
      </DialogTitle>

      <DialogContent dividers>
        <form id="createGroupForm" onSubmit={formOnSubmit}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
            {/* Left: group details */}
            <Box>
              <TextField
                fullWidth
                size="small"
                label="Group Name"
                placeholder="E.g. Beach Volleyball Crew"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                required
                sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />

              <TextField
                fullWidth
                size="small"
                multiline
                rows={4}
                label="Group Notes / Core Focus"
                placeholder="E.g. Best friends from high school or local surf buddies..."
                value={groupNotes}
                onChange={(e) => setGroupNotes(e.target.value)}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />

              {/* Planning Place Ideas - show existing place ideas count */}
              {editingGroup && editingGroup.planning?.placeIdeas && editingGroup.placingPlaceIdeas?.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="caption" sx={{ display: 'block', fontFamily: 'monospace', fontSize: '9px', textTransform: 'uppercase', fontWeight: 700, color: '#CC7A5C', mb: 0.5 }}>
                    Place Ideas ({editingGroup.placingPlaceIdeas?.length || 0})
                  </Typography>
                  <Typography variant="caption" sx={{ display: 'block', color: '#7D7B6D' }}>
                    {editingGroup.placingPlaceIdeas.map(id => id).join(', ')}
                  </Typography>
                </Box>
              )}
            </Box>

            {/* Right: members */}
            <Box>
              <Typography variant="caption" sx={{ display: 'block', fontFamily: 'monospace', fontSize: '9px', textTransform: 'uppercase', fontWeight: 700, color: '#7D7B6D', mb: 1 }}>
                Group Members
              </Typography>
                <Paper variant="outlined" sx={{ p: 1.5, maxHeight: 230, overflowY: 'auto', borderRadius: 2 }}>
                  {friends.map((f) => {
                   const isChecked = groupMemberIds.includes(f.id);
                   return (
                       <Box key={f.id} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 0.5, px: 1, borderRadius: 1, cursor: 'pointer', '&:hover': { backgroundColor: '#FBFBF9' } }}>
                         <Typography variant="body2" sx={{ fontSize: '12px' }}>{f.name}{f.location?.city ? ` · ${f.location.city}` : ''}</Typography>
                         <input type="checkbox" checked={isChecked} onChange={() => toggleGroupMember(f.id)} style={{ accentColor: '#CC7A5C' }} />
                       </Box>
                     );
                   })}
                 </Paper>
              <Typography variant="caption" sx={{ display: 'block', fontStyle: 'italic', color: '#7D7B6D', mt: 1, fontSize: '10px' }}>
                Select friends to include in this custom preset group.
              </Typography>
            </Box>
          </Box>

          <Divider sx={{ my: 2 }} />
        </form>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        <Button onClick={() => { setIsCreatingGroup(false); if (!editingGroup) { setGroupName(''); setGroupNotes(''); setGroupMemberIds([]); } }}>Cancel</Button>
        <Button type="submit" form="createGroupForm" variant="contained" sx={{ backgroundColor: '#5A5A40', '&:hover': { backgroundColor: '#434330' } }}>
          {editingGroup ? 'Save Group' : 'Create Group'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/* ========================================================================
 * HangoutScheduler — Main exported component.
 * State lives here; extracted sub-components receive everything via props.
 * ======================================================================== */
export default function HangoutScheduler({
  friends = [],
  groups = [],
  plannedHangouts = [],
  history = [],
  onAddPlannedHangout,
  onCompletePlannedHangout,
  onAddGroup,
  onEditGroup,
  onDeleteGroup,
  onDeletePlannedHangout,
  onTriggerNotification,
  editingGroup = null,
  setEditingGroup = null,
  editingHangout = null,
  isEditingHangoutMode = false,
  onSaveHangout = null,
  pois = [],
  onPlanEvent = null,
}) {

/**
 * Helper: convert a UTC ISO datetime string to local time string for datetime-local input.
 * Firestore stores datetimes as UTC (e.g. 2026-08-01T01:00:00.000Z).
 * The <input type="datetime-local"> expects the browser's local timezone.
 */
function utcToLocalDatetimeInput(utcIso) {
  if (!utcIso) return '2026-07-15T18:00';
  const dt = new Date(utcIso);
  if (isNaN(dt.getTime())) return '2026-07-15T18:00';
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

/**
 * Helper: resolve POI name and address from merged POI array (user POIs + existingPOIs).
 */
function resolvePoiInfo(poiId, userPois, localPoisArray) {
  if (!poiId) return { name: null, address: null };
  // Prefer userPOIs (which may include friend POIs loaded by the parent), fall back to local
  const poi = (userPois && userPois.length > 0 ? userPois : localPoisArray)?.find((p) => p.id === poiId);
  if (!poi) return { name: null, address: null };
  return {
    name: poi.name || poi.location?.address || null,
    address: poi.location?.address || null,
  };
}

  const [isScheduling, setIsScheduling] = useState(false);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);

    // Ref to track if we're currently populating form fields from editingHangout
    // (prevents re-entrant useEffect calls)
  const isPopulatingRef = React.useRef(false);

    // Form states for scheduling
  const [hangoutTitle, setHangoutTitle] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [hangoutType, setHangoutType] = useState('physical');
  const [datetime, setDatetime] = useState('2026-07-15T18:00');
  const [details, setDetails] = useState('');
  const [selectedPoiId, setSelectedPoiId] = useState(null);
  const [customAttendeeIds, setCustomAttendeeIds] = useState([]);

    // Sync editing hangout state into form fields when it changes
  React.useEffect(() => {
    if (editingHangout && !isPopulatingRef.current) {
      isPopulatingRef.current = true;
      setHangoutTitle(editingHangout.title || '');
      setSelectedGroupId(editingHangout.groupId || '');
      setHangoutType(editingHangout.type || 'physical');
          // Convert UTC datetime to local time for datetime-local input
      setDatetime(editingHangout.datetime ? utcToLocalDatetimeInput(editingHangout.datetime) : '2026-07-15T18:00');
      setDetails(editingHangout.description || '');
          // Populate attendee checkboxes from friendIds (only when actually editing, not clearing)
      setCustomAttendeeIds(editingHangout.friendIds || []);
          // Show the scheduler dialog when editing a hangout
      setIsScheduling(true);
      setIsCreatingGroup(false);
      setTimeout(() => { isPopulatingRef.current = false; }, 0);
       }
    }, [editingHangout]);

    // When editingHangout is cleared (e.g. by Plan Event), reset form fields to create mode defaults.
    // This runs AFTER the useEffect above and ensures the dialog shows as a fresh create form.
  React.useEffect(() => {
    if (editingHangout === null && isPopulatingRef.current === false) {
      setHangoutTitle('');
      setSelectedGroupId('');
      setHangoutType('physical');
      setDatetime(dayjs().format('YYYY-MM-DDTHH:mm'));
      setDetails('');
      setSelectedPoiId(null);
      setCustomAttendeeIds([]);
       }
    }, [editingHangout]);

    // When a POI ID exists on the hangout being edited but isn't found in existingPOIs,
    // fetch it from Firestore so the address displays correctly.
  React.useEffect(() => {
    if (!editingHangout?.poiId) return;
    const user = auth.currentUser;
    if (!user) return;

     // Only fetch if the POI isn't already in our local lists
    const poiAlreadyLoaded = existingPOIs.some((p) => p.id === editingHangout.poiId) ||
                              (pois && pois.length > 0 && pois.some((p) => p.id === editingHangout.poiId));
    if (poiAlreadyLoaded) return;

    let cancelled = false;
    setLoadingPOIs(true);
    getDocs(collection(db, 'users', user.uid, 'poi'))
      .then((snap) => {
        if (cancelled) return;
        const doc = snap.docs.find((d) => d.id === editingHangout.poiId);
        if (doc) {
          setExistingPOIs((prev) => [...prev, { id: doc.id, ...doc.data() }]);
        }
      })
      .catch((err) => { console.error('Error loading hangout POI:', err); })
      .finally(() => { if (!cancelled) setLoadingPOIs(false); });

    return () => { cancelled = true; };
  }, [editingHangout?.poiId, editingHangout]);

   // POI picker states
  const [showPoiPicker, setShowPoiPicker] = useState(false);
  const [existingPOIs, setExistingPOIs] = useState([]);
  const [loadingPOIs, setLoadingPOIs] = useState(false);
  const [poiSearchQuery, setPoiSearchQuery] = useState('');

  // Form states for creating a group
  const [groupName, setGroupName] = useState('');
  const [groupNotes, setGroupNotes] = useState('');
  const [groupMemberIds, setGroupMemberIds] = useState([]);

  // Format date nicely
  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Load existing POIs from Firestore
  const loadExistingPOIs = useCallback(async (search = '') => {
    const user = auth.currentUser;
    if (!user) return;

    setLoadingPOIs(true);
    try {
      const poiSnapshot = await getDocs(collection(db, 'users', user.uid, 'poi'));
      let pois = poiSnapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      // Filter by search query if provided
      if (search.trim()) {
        const q = search.toLowerCase();
        pois = pois.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            (p.location?.address && p.location.address.toLowerCase().includes(q)) ||
            (p.location?.city && p.location.city.toLowerCase().includes(q))
        );
      }
      setExistingPOIs(pois);
    } catch (error) {
      console.error('Error loading POIs:', error);
    } finally {
      setLoadingPOIs(false);
    }
  }, []);

    // Open the POI picker dialog — accepts preSelectPoiId to highlight existing POI in edit mode
  const openPoiPicker = useCallback(async (preSelectPoiId = null) => {
    setPoiSearchQuery('');
    setSelectedPoiId(preSelectPoiId);
    setShowPoiPicker(true);
    await loadExistingPOIs();
   }, [loadExistingPOIs]);

  // Handle search input change with debouncing — uses refs so the ref
  // doesn't change across renders, avoiding debounce-reset bugs too.
  const timeoutRef = React.useRef(null);
  const handlePoiSearchChange = useCallback((e) => {
    const query = e.target.value;
    setPoiSearchQuery(query);
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      loadExistingPOIs(query);
    }, 300);
  }, [loadExistingPOIs]);

  // Select a POI from the list
  const handleSelectPoi = useCallback((poiId) => {
    setSelectedPoiId(poiId);
  }, []);

  // Confirm the POI selection and close the picker
  const confirmLocationSelection = useCallback(() => {
    if (!selectedPoiId) return;
    setShowPoiPicker(false);
  }, [selectedPoiId]);

  // Cancel and close the POI picker
  const cancelLocationSelection = useCallback(() => {
    setShowPoiPicker(false);
    setSelectedPoiId(null);
    setPoiSearchQuery('');
  }, []);

  // Helper to handle group selection change in scheduler form
  const handleGroupChange = useCallback((groupId) => {
    setSelectedGroupId(groupId);
    const group = groups.find((g) => g.id === groupId);
    if (group) {
      setCustomAttendeeIds(group.memberIds);
    } else {
      setCustomAttendeeIds([]);
    }
  }, [groups]);

  // Toggle custom attendee selection
  const toggleAttendee = useCallback((friendId) => {
    if (customAttendeeIds.includes(friendId)) {
      setCustomAttendeeIds(customAttendeeIds.filter((id) => id !== friendId));
    } else {
      setCustomAttendeeIds([...customAttendeeIds, friendId]);
    }
  }, [customAttendeeIds]);

   // Handle schedule submission for planning hangouts
  const handleScheduleSubmit = useCallback((e) => {
    e.preventDefault();
    if (!hangoutTitle.trim() || customAttendeeIds.length === 0) {
      onTriggerNotification('Please provide a title and select at least one attendee.');
      return;
    }

     // Build the hangout data object with proper friendIds field (required by Hangout schema)
    const hangoutData = {
      title: hangoutTitle.trim(),
      poiId: selectedPoiId || null,
      type: hangoutType,
      datetime: new Date(datetime).toISOString(),
      friendIds: customAttendeeIds.length > 0 ? [...customAttendeeIds] : [],
     };
     // Only add optional fields if they have actual values
    if (details.trim()) {
      hangoutData.description = details.trim();
    }
    if (selectedGroupId) {
      hangoutData.groupId = selectedGroupId;
    }

    onAddPlannedHangout(hangoutData).then(() => {
      // Reset scheduler state on success
      setHangoutTitle('');
      setSelectedGroupId('');
      setCustomAttendeeIds([]);
      setSelectedPoiId(null);
      setDetails('');
      setIsScheduling(false);
      onTriggerNotification(`Scheduled upcoming hangout "${hangoutData.title}"!`);
    }).catch((err) => {
      console.error('Error creating hangout:', err);
      onTriggerNotification(`Failed to create hangout: ${err.message}`);
    });
  }, [hangoutTitle, selectedGroupId, hangoutType, datetime, details, customAttendeeIds, selectedPoiId, onAddPlannedHangout, onTriggerNotification]);

  // Handle group creation / editing submission
  const handleGroupSubmit = useCallback((e) => {
    e.preventDefault();
    if (!groupName.trim() || groupMemberIds.length === 0) {
      onTriggerNotification('Please provide a group name and select at least one member.');
      return;
    }

    if (editingGroup) {
      // For editing: use editGroup data, preserve planning object
      const updatedGroup = {
        name: groupName.trim(),
        memberIds: groupMemberIds,
        planning: {
          hangoutIds: editingGroup.planning?.hangoutIds || [],
          placeIdeas: editingGroup.placingPlaceIdeas || editingGroup.planning?.placeIdeas || [],
          notes: groupNotes.trim() || '',
        },
      };

      onAddGroup(updatedGroup, editingGroup.id).then(() => {
        setIsCreatingGroup(false);
        setEditingGroup(null);
        setGroupName('');
        setGroupNotes('');
        setGroupMemberIds([]);
        onTriggerNotification(`Updated group "${groupName.trim()}"!`);
      }).catch((err) => {
        console.error('Error updating group:', err);
        onTriggerNotification(`Failed to update group: ${err.message}`);
      });
    } else {
      // New group with proper schema: planning object per JSON schema
      const newGroup = {
        name: groupName.trim(),
        memberIds: groupMemberIds,
        planning: {
          hangoutIds: [],
          placeIdeas: [],
          notes: groupNotes.trim() || '',
        },
      };

      onAddGroup(newGroup).then(() => {
        // Reset group form state
        setGroupName('');
        setGroupNotes('');
        setGroupMemberIds([]);
        setIsCreatingGroup(false);
        onTriggerNotification(`Created new group "${groupName.trim()}"!`);
      }).catch((err) => {
        console.error('Error creating group:', err);
        onTriggerNotification(`Failed to create group: ${err.message}`);
      });
    }
  }, [groupName, groupMemberIds, groupNotes, onAddGroup, editingGroup, setEditingGroup, onTriggerNotification]);

  const toggleGroupMember = useCallback((friendId) => {
    if (groupMemberIds.includes(friendId)) {
      setGroupMemberIds(groupMemberIds.filter((id) => id !== friendId));
    } else {
      setGroupMemberIds([...groupMemberIds, friendId]);
    }
  }, [groupMemberIds]);

  // Handle complete hangout leap simulation
  const handleCompleteLeap = useCallback((hangout) => {
    // Find attendees. If it is a standard group, we default to group members.
    const groupObj = groups.find((g) => g.id === hangout.groupId);
    const attendees = groupObj ? groupObj.memberIds : friends.map((f) => f.id);

    onCompletePlannedHangout(hangout.id, hangout.datetime, attendees);

    const namesList = attendees
      .map((id) => friends.find((f) => f.id === id)?.name)
      .filter(Boolean)
      .join(', ');

    onTriggerNotification(`Simulated leap! "${hangout.title}" completed. Updated contact records for: ${namesList}.`);
  }, [groups, friends, onCompletePlannedHangout, onTriggerNotification]);

    // Get POI name + address by ID — merges pois (parent) with local existingPOIs.
    // In edit mode this resolves friend-owned POIs (home, places) that don't live in the current user's POI collection.
  const getPoiNameById = useCallback((poiId) => {
      // If editing, prefer pois which contains all POIs for this user/friends
    if (isEditingHangoutMode && pois && pois.length > 0) {
      const poi = pois.find((p) => p.id === poiId);
      if (poi) return poi.name || poi.location?.address || 'Unnamed Location';
    }
    const poi = existingPOIs.find((p) => p.id === poiId);
    return poi ? poi.name : null;
    }, [existingPOIs, pois, isEditingHangoutMode]);

    // Get POI address by ID (for displaying full street address in edit mode)
  const getPoiAddressById = useCallback((poiId) => {
    if (isEditingHangoutMode && pois && pois.length > 0) {
      const poi = pois.find((p) => p.id === poiId);
      if (poi && poi.location?.address) return poi.location.address;
    }
    const poi = existingPOIs.find((p) => p.id === poiId);
    return poi ? poi.location?.address : null;
    }, [existingPOIs, pois, isEditingHangoutMode]);

   // Build the shared props object so the extracted component always
   // receives fresh state without being re-created itself.
  const schedulingFormProps = React.useMemo(() => ({
    isScheduling, setIsScheduling,
    hangoutTitle, setHangoutTitle,
    selectedGroupId, setSelectedGroupId,
    hangoutType, setHangoutType,
    datetime, setDatetime,
    details, setDetails,
    selectedPoiId, setSelectedPoiId,
    showPoiPicker, setShowPoiPicker,
    existingPOIs,
    loadingPOIs,
    poiSearchQuery, setPoiSearchQuery,
    loadExistingPOIs,
    friends,
    groups,
    customAttendeeIds, setCustomAttendeeIds,
    onSubmit: handleScheduleSubmit,
    handleGroupChange,
    toggleAttendee,
    openPoiPicker,
    handlePoiSearchChange,
    handleSelectPoi,
    confirmLocationSelection,
    cancelLocationSelection,
    getPoiNameById,
    getPoiAddressById,
    isEditingHangoutMode,
    editingHangout,
    onSaveHangout,
    pois,
    }), [
    isScheduling, hangoutTitle, selectedGroupId, hangoutType, datetime, details,
    selectedPoiId, showPoiPicker, existingPOIs, loadingPOIs, poiSearchQuery,
    loadExistingPOIs, friends, groups, customAttendeeIds,
    handleScheduleSubmit, handleGroupChange, toggleAttendee, openPoiPicker,
    handlePoiSearchChange, handleSelectPoi, confirmLocationSelection,
    cancelLocationSelection, getPoiNameById, getPoiAddressById,
    isEditingHangoutMode, editingHangout, onSaveHangout, pois,
    ]);

  const groupFormProps = React.useMemo(() => ({
    isCreatingGroup, setIsCreatingGroup,
    groupName, setGroupName,
    groupNotes, setGroupNotes,
    groupMemberIds, setGroupMemberIds,
    friends,
    onSubmit: handleGroupSubmit,
    toggleGroupMember,
    editingGroup,
  }), [
    isCreatingGroup, groupName, groupNotes, groupMemberIds,
    friends, handleGroupSubmit, toggleGroupMember, editingGroup,
  ]);

  return (
    <Box>
      {/* Plan Event / Create Group dialogs — stable component references */}
      <SchedulingFormDialog {...schedulingFormProps} />
      <GroupCreationForm {...groupFormProps} />

      {/* Main Hub */}
      <Paper sx={{ p: 3, borderRadius: 3, border: '1px solid #EBE9E2', backgroundColor: '#FFFFFF' }}>
        {/* Header with buttons */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1.5, borderBottom: '1px solid #F2F0EA', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Clock size={18} color="#CC7A5C" />
            <Typography variant="subtitle1" sx={{ fontFamily: 'serif', fontWeight: 700, fontSize: '1rem', color: '#2D2D20' }}>
              Commitments & Planning
            </Typography>
          </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
               {/* Plan Event button — clears edit state via onPlanEvent then opens a fresh create form */}
               <Button
              onClick={() => {
                if (onPlanEvent) onPlanEvent();
                 // Reset form fields for a fresh hangout creation
                setHangoutTitle('');
                setSelectedGroupId('');
                setCustomAttendeeIds([]);
                setSelectedPoiId(null);
                setDetails('');
                setDatetime(dayjs().format('YYYY-MM-DDTHH:mm'));
                setIsCreatingGroup(false);
                setEditingGroup(null);
                setIsScheduling(true);
                }}
              variant="outlined"
              size="small"
              startIcon={<Calendar size={14} />}
              sx={{
                textTransform: 'none',
                fontSize: '11px',
                fontWeight: 600,
                borderRadius: 2,
                borderColor: '#5A5A4030',
                color: '#5A5A40',
                backgroundColor: '#5A5A4010',
                 '&:hover': { backgroundColor: '#5A5A4020', borderColor: '#5A5A4050' },
                }}
              >
              Plan Event
              </Button>
            <Button
              onClick={() => { setIsCreatingGroup(true); setIsScheduling(false); setEditingGroup(null); }}
              variant="outlined"
              size="small"
              startIcon={<Users size={14} />}
              sx={{
                textTransform: 'none',
                fontSize: '11px',
                fontWeight: 600,
                borderRadius: 2,
                borderColor: '#9E9EA830',
                color: '#5A5A40',
                backgroundColor: '#9E9EA810',
                '&:hover': { backgroundColor: '#9E9EA820', borderColor: '#9E9EA850' },
              }}
            >
              Create Group
            </Button>
          </Box>
        </Box>

        {/* Groups Quick Overview */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="caption" sx={{ display: 'block', fontFamily: 'monospace', fontSize: '9px', textTransform: 'uppercase', fontWeight: 700, color: '#7D7B6D', mb: 1.5 }}>
            Preset Friend Groups
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
            {(groups || []).map((group) => {
              const memberNames = (group.memberIds || [])
                .map((id) => (friends || []).find((f) => f.id === id)?.name?.split(' ')[0])
                .filter(Boolean)
                .join(', ');

              return (
                <Paper key={group.id} variant="outlined" sx={{ p: 2, borderRadius: 2, backgroundColor: '#FBFBF9', position: 'relative' }}>
                  {(onEditGroup || onAddGroup) && (
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onEditGroup) onEditGroup(group);
                      }}
                      sx={{ position: 'absolute', top: 8, right: 32, color: '#9B988C', '&:hover': { color: '#5A5A40' } }}
                      title="Edit Group"
                    >
                      <Pencil size={12} />
                    </IconButton>
                  )}
                  {(onDeleteGroup) && (
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteGroup(group.id);
                      }}
                      sx={{ position: 'absolute', top: 8, right: 8, color: '#9B988C', '&:hover': { color: '#CC7A5C' } }}
                      title="Delete Group"
                    >
                      <Trash2 size={12} />
                    </IconButton>
                  )}
                  <Typography variant="subtitle2" sx={{ fontFamily: 'serif', fontWeight: 700, fontSize: '0.85rem', color: '#2D2D20' }}>
                    {group.name}
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#7D7B6D', display: 'block', mt: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {group.notes || group.planning?.notes || 'No group notes'}
                  </Typography>
                  <Chip
                    label={`Members: ${memberNames || 'None'}`}
                    size="small"
                    sx={{
                      mt: 1,
                      backgroundColor: '#F0EEE6',
                      color: '#5A5A40',
                      fontFamily: 'monospace',
                      fontSize: '10px',
                      height: 22,
                    }}
                  />
                </Paper>
              );
            })}
          </Box>
        </Box>

        {/* Pending Commitments */}
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
            <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: '9px', textTransform: 'uppercase', fontWeight: 700, color: '#7D7B6D' }}>
              Pending Commitments
            </Typography>
            <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: '9px', fontStyle: 'italic', color: '#CC7A5C' }}>
              Time-Leap simulates event completion
            </Typography>
          </Box>

          {plannedHangouts.length > 0 ? (
            <Box sx={{ maxHeight: 280, overflowY: 'auto', '&::-webkit-scrollbar': { width: '6px' }, '&::-webkit-scrollbar-thumb': { backgroundColor: '#ccc', borderRadius: '3px' } }}>
              {plannedHangouts.map((hangout) => {
                const groupObj = groups.find((g) => g.id === hangout.groupId);
                const attendees = groupObj ? groupObj.memberIds : [];
                const attendeeNames = attendees
                  .map((id) => friends.find((f) => f.id === id)?.name?.split(' ')[0])
                  .filter(Boolean)
                  .join(', ');

                return (
                  <Paper key={hangout.id} variant="outlined" sx={{ p: 2, mb: 1.5, borderRadius: 2, backgroundColor: '#FFFFFF' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                      <Box>
                        <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: '9px', textTransform: 'uppercase', color: '#7D7B6D', display: 'block' }}>
                          {groupObj ? groupObj.name : 'Custom Event'}
                        </Typography>
                        <Typography variant="subtitle2" sx={{ fontFamily: 'serif', fontWeight: 700, fontSize: '0.85rem', color: '#2D2D20' }}>
                          {hangout.title}
                        </Typography>
                      </Box>
                      <Chip
                        label={hangout.type === 'physical' ? 'PHYSICAL' : 'VIRTUAL'}
                        size="small"
                        sx={{
                          backgroundColor: hangout.type === 'physical' ? '#25D36610' : '#5865F210',
                          color: hangout.type === 'physical' ? '#1e8544' : '#5865F2',
                          fontFamily: 'monospace',
                          fontSize: '9px',
                          fontWeight: 700,
                          height: 20,
                          border: `1px solid ${hangout.type === 'physical' ? '#25D36630' : '#5865F230'}`,
                        }}
                      />
                    </Box>

                    <Box sx={{ mt: 1.5 }}>
                      {hangout.locationPoiId && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.75 }}>
                          <MapPin size={14} color="#9B988C" />
                          <Typography variant="body2" sx={{ fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {hangout.locationPoiId}
                          </Typography>
                        </Box>
                      )}
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #F2F0EA', pt: 1, mt: 0.5 }}>
                        <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: '10px', color: '#7D7B6D' }}>
                          {formatDate(hangout.datetime)}
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                          <Button
                            onClick={() => handleCompleteLeap(hangout)}
                            size="small"
                            startIcon={<Flame size={12} color="#FFDD6B" />}
                            sx={{
                              textTransform: 'none',
                              fontSize: '9px',
                              fontWeight: 700,
                              fontFamily: 'monospace',
                              backgroundColor: '#5A5A40',
                              color: '#FFFFFF',
                              '&:hover': { backgroundColor: '#434330' },
                            }}
                            title="Leap time forward to simulate completing this event"
                          >
                            Leap Complete
                          </Button>
                          <IconButton
                            onClick={() => onDeletePlannedHangout(hangout.id)}
                            size="small"
                            sx={{ color: '#9B988C', '&:hover': { color: '#CC7A5C', backgroundColor: '#FBFBF9' } }}
                            title="Cancel Commitment"
                          >
                            <X size={14} />
                          </IconButton>
                        </Box>
                      </Box>
                    </Box>

                    {attendeeNames && (
                      <Typography variant="caption" sx={{ display: 'block', mt: 1, p: 1, backgroundColor: '#FBFBF9', border: '1px solid #EBE9E2', borderRadius: 1, fontSize: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        Attendees: <Typography component="span" sx={{ fontWeight: 700, color: '#2D2D20' }}>{attendeeNames}</Typography>
                      </Typography>
                    )}
                  </Paper>
                );
              })}
            </Box>
          ) : (
            <Box sx={{ textAlign: 'center', py: 4, px: 3, backgroundColor: '#FBFBF9', border: '1px dashed #E0DED7', borderRadius: 2 }}>
              <Typography variant="body2" sx={{ color: '#9B988C', fontStyle: 'italic', fontSize: '12px' }}>
                No active planned events. Click Plan Event to schedule.
              </Typography>
            </Box>
          )}
        </Box>

        {/* Historical Logs */}
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1.5 }}>
            <ClipboardList size={14} color="#7D7B6D" />
            <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: '9px', textTransform: 'uppercase', fontWeight: 700, color: '#7D7B6D' }}>
              Past Completed Logs ({history.length})
            </Typography>
          </Box>

          {history.length > 0 ? (
            <Box sx={{ maxHeight: 200, overflowY: 'auto', '&::-webkit-scrollbar': { width: '6px' }, '&::-webkit-scrollbar-thumb': { backgroundColor: '#ccc', borderRadius: '3px' } }}>
              {history.map((h, idx) => {
                const attendeeNames = h.friendIds
                  .map((fId) => friends.find((f) => f.id === fId)?.name?.split(' ')[0])
                  .filter(Boolean)
                  .join(', ');

                return (
                  <Box key={h.id || idx} sx={{ pb: 1.5, mb: 1.5, borderBottom: '1px solid #F2F0EA', '&:last-child': { borderBottom: 'none', pb: 0 } }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.25 }}>
                      <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: '10px', color: '#9B988C' }}>
                        {formatDate(h.datetime)}
                      </Typography>
                      <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: '10px', color: '#5A5A40', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
                        {attendeeNames || 'No attendees'}
                      </Typography>
                    </Box>
                    <Typography variant="subtitle2" sx={{ fontFamily: 'serif', fontWeight: 700, fontSize: '0.8rem', color: '#2D2D20', display: 'block', mt: 0.25 }}>
                      {h.title}
                    </Typography>
                    {h.details && (
                      <Typography variant="caption" sx={{ display: 'block', color: '#7D7B6D', fontStyle: 'italic', fontSize: '10px', mt: 0.25 }}>
                        {h.details}
                      </Typography>
                    )}
                  </Box>
                );
              })}
            </Box>
          ) : (
            <Typography variant="body2" sx={{ color: '#9B988C', fontStyle: 'italic', fontSize: '12px' }}>
              No past completed logs.
            </Typography>
          )}
        </Box>
      </Paper>
    </Box>
  );
}