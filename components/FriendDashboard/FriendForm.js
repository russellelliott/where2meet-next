import React, { useState } from 'react';
import dayjs from 'dayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DateCalendar } from '@mui/x-date-pickers/DateCalendar';
import {
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Tabs,
  Tab,
  Chip,
  Autocomplete,
  CircularProgress,
  GlobalStyles,
} from '@mui/material';
import { createPoiFromCoordinates } from '../../lib/poiService';
import { saveFriend, updateFriend } from '../../lib/friendService';
import { auth, db } from '../../firebaseConfig';
import { collection, getDocs } from 'firebase/firestore';
import { toast } from 'react-toastify';
import { GoogleMap, Marker } from '@react-google-maps/api';

/**
 * FriendForm Component
 * Add/Edit a friend with location POI selection, temporary locations with dates
 */
export default function FriendForm({ onSave, onClose, editFriend = null }) {
  const [formData, setFormData] = useState({
    name: editFriend?.name || '',
    tagsInput: (editFriend?.tags || []).join(', '),
    contact: {
      phone: editFriend?.contact?.phone || false,
      whatsapp: editFriend?.contact?.whatsapp || false,
      discord: editFriend?.contact?.discord || false,
      instagram: editFriend?.contact?.instagram || false,
      primary: editFriend?.contact?.primary || 'phone',
      handle: editFriend?.contact?.handle || '',
    },
    location: {
      homePoiId: editFriend?.location?.homePoiId || '',
      temporaryLocation: editFriend?.location?.temporaryLocation || {
        startDate: null,
        endDate: null,
        poiId: null,
      },
    },
    logistics: {
      canDrive: editFriend?.logistics?.canDrive || false,
      pickupRequired: editFriend?.logistics?.pickupRequired || false,
      pickupPoiId: editFriend?.logistics?.pickupPoiId || '',
    },
    planning: {
      notes: editFriend?.planning?.notes || '',
    },
    notes: editFriend?.notes || '',
  });

  const [tabValue, setTabValue] = useState(0);
  const [showCalendar, setShowCalendar] = useState(null); // 'tempStart', 'tempEnd'
  const [calendarDate, setCalendarDate] = useState(dayjs());
  const [poiPickerMode, setPoiPickerMode] = useState(null); // 'home', 'pickup', 'tempLocation'
  const [existingPOIs, setExistingPOIs] = useState([]);
  const [loadingPOIs, setLoadingPOIs] = useState(false);
  const [selectedExistingPOI, setSelectedExistingPOI] = useState(null);
  const [formErrors, setFormErrors] = useState({});

  const loadExistingPOIs = async () => {
    const user = auth.currentUser;
    if (!user) return;

    setLoadingPOIs(true);
    try {
      const poiSnapshot = await getDocs(collection(db, 'users', user.uid, 'poi'));
      const pois = poiSnapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setExistingPOIs(pois);
    } catch (error) {
      console.error('Error loading POIs:', error);
    } finally {
      setLoadingPOIs(false);
    }
  };

  const openPOIPicker = async (mode) => {
    setPoiPickerMode(mode);
    setSelectedExistingPOI(null);
    await loadExistingPOIs();
  };

  const handleSelectExistingPOI = (poiId) => {
    setSelectedExistingPOI(poiId);
  };

  const updateFriendLocation = (mode, poiId) => {
    if (mode === 'home') {
      setFormData((prev) => ({
        ...prev,
        location: { ...prev.location, homePoiId: poiId },
      }));
    } else if (mode === 'pickup') {
      setFormData((prev) => ({
        ...prev,
        logistics: { ...prev.logistics, pickupPoiId: poiId },
      }));
    } else if (mode === 'tempLocation') {
      setFormData((prev) => ({
        ...prev,
        location: {
          ...prev.location,
          temporaryLocation: { ...prev.location.temporaryLocation, poiId },
        },
      }));
    }
  };

  const confirmPOISelection = () => {
    if (!poiPickerMode || !selectedExistingPOI) return;
    updateFriendLocation(poiPickerMode, selectedExistingPOI);
    setPoiPickerMode(null);
    setSelectedExistingPOI(null);
  };

  const cancelPOISelection = () => {
    setPoiPickerMode(null);
    setSelectedExistingPOI(null);
  };

  const handleTabChange = (newValue) => {
    setTabValue(newValue);
  };

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleContactChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      contact: { ...prev.contact, [field]: value },
    }));
  };

  const handleLogisticsChange = (field, value) => {
    const updatedLogistics = { ...formData.logistics, [field]: value };
    if (field === 'canDrive' && value) {
      updatedLogistics.pickupRequired = false;
    }
    if (field === 'pickupRequired' && value) {
      updatedLogistics.canDrive = false;
    }
    setFormData((prev) => ({ ...prev, logistics: updatedLogistics }));
  };

  const handleTemporaryLocationChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      location: {
        ...prev.location,
        temporaryLocation: {
          ...prev.location.temporaryLocation,
          [field]: value,
        },
      },
    }));
  };

  const handleCalendarChange = (newValue) => {
    if (!newValue) return;
    if (showCalendar === 'tempStart') {
      handleTemporaryLocationChange('startDate', newValue.toISOString());
    } else if (showCalendar === 'tempEnd') {
      handleTemporaryLocationChange('endDate', newValue.toISOString());
    }
  };

  const getPoiNameById = (poiId) => {
    const poi = existingPOIs.find((p) => p.id === poiId);
    return poi ? poi.name : null;
  };

  const handleMapPoiCreated = async (poiData) => {
    if (!poiData || !poiData.location || poiPickerMode !== 'tempLocation') {
      return;
    }

    const user = auth.currentUser;
    if (!user) return;

    try {
      const newPoi = await createPoiFromCoordinates({
        userId: user.uid,
        lat: poiData.location.lat,
        lng: poiData.location.lng,
        visibility: { access: 'private', scope: 'selective' },
      });

      if (newPoi) {
        updateFriendLocation(poiPickerMode, newPoi.id);
        setExistingPOIs((prev) => [...prev, { ...newPoi, id: newPoi.id }]);
        setSelectedExistingPOI(newPoi.id);
      }
    } catch (error) {
      console.error('Error saving POI:', error);
      toast.error('Failed to save location.');
    }
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.name.trim()) {
      errors.name = 'Name is required';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    const user = auth.currentUser;
    if (!user) {
      toast.error('You must be logged in to save a friend.');
      return;
    }

    const parsedTags = formData.tagsInput
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);

    const lastContactDate =
      formData.contact.lastContactDate || new Date().toISOString();

    const friendData = {
      name: formData.name.trim(),
      tags: parsedTags.length > 0 ? parsedTags : ['Friend'],
      contact: {
        ...formData.contact,
        lastContactDate,
        handle: formData.contact.handle?.trim() || undefined,
      },
      location: {
        homePoiId: formData.location.homePoiId || undefined,
        temporaryLocation:
          formData.location.temporaryLocation.poiId
            ? formData.location.temporaryLocation
            : undefined,
      },
      logistics: {
        ...formData.logistics,
        pickupPoiId: formData.logistics.pickupPoiId || undefined,
      },
      planning: {
        notes: formData.planning.notes?.trim() || undefined,
      },
      notes: formData.notes?.trim() || undefined,
    };

    try {
      if (editFriend) {
        await updateFriend(user.uid, editFriend.id, friendData);
        toast.success('Friend updated successfully!');
      } else {
        await saveFriend(user.uid, friendData);
        toast.success('Friend added successfully!');
      }
      onSave(friendData);
      onClose();
    } catch (error) {
      console.error('Error saving friend:', error);
      toast.error('Failed to save friend. Please try again.');
    }
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Dialog
        open={true}
        onClose={onClose}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, backgroundColor: '#FBFBF9' } }}
      >
        <DialogTitle sx={{ pb: 1 }}>
          {editFriend ? 'Edit Friend' : 'Add New Friend'}
        </DialogTitle>

        <DialogContent
          dividers
          sx={{
            '&::-webkit-scrollbar': { width: '6px' },
            '&::-webkit-scrollbar-thumb': {
              backgroundColor: '#ccc',
              borderRadius: '3px',
            },
          }}
        >
          <form onSubmit={handleSubmit}>
            <Tabs
              value={tabValue}
              onChange={(e, newValue) => handleTabChange(newValue)}
              sx={{ mb: 3 }}
            >
              <Tab label="Basic Info" />
              <Tab label="Location" />
              <Tab label="Logistics" />
              <Tab label="Notes" />
            </Tabs>

            {/* Tab 1: Basic Info */}
            {tabValue === 0 && (
              <Box sx={{ pt: 2 }}>
                <TextField
                  fullWidth
                  label="Full Name"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  error={!!formErrors.name}
                  helperText={formErrors.name}
                  margin="normal"
                  required
                />

                <Autocomplete
                  multiple
                  freeSolo
                  value={formData.tagsInput.split(', ').filter(Boolean)}
                  onChange={(event, newValue) => {
                    setFormData((prev) => ({
                      ...prev,
                      tagsInput: newValue.join(', '),
                    }));
                  }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Tags (Comma separated)"
                      placeholder="E.g. UCSC, Hiking, Outdoors"
                      margin="normal"
                      size="small"
                    />
                  )}
                  renderTags={(value, getTagProps) =>
                    value.map((option, index) => (
                       <Chip
                        key={`tag-${index}`}
                        variant="outlined"
                        label={option}
                        {...getTagProps({ index })}
                        sx={{ fontSize: '11px', height: '22px' }}
                      />
                    ))
                  }
                  sx={{ mb: 2 }}
                />

                <TextField
                  fullWidth
                  select
                  label="Primary Channel"
                  value={formData.contact.primary}
                  onChange={(e) => handleContactChange('primary', e.target.value)}
                  margin="normal"
                  SelectProps={{ native: true }}
                  size="small"
                >
                  <option value="phone">Phone Call</option>
                  <option value="discord">Discord</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="instagram">Instagram</option>
                </TextField>

                 <TextField
                  fullWidth
                  label="Handle / Number / Detail"
                  placeholder={
                    formData.contact.primary === 'phone'
                       ? '+1 (555) 000-0000'
                       : formData.contact.primary === 'discord'
                       ? 'username#1234'
                       : formData.contact.primary === 'whatsapp'
                       ? '+1 (555) 000-0000'
                       : formData.contact.primary === 'instagram'
                       ? '@insta_handle'
                       : 'email@example.com'
                   }
                  value={formData.contact.handle}
                  onChange={(e) => handleContactChange('handle', e.target.value)}
                  margin="normal"
                  size="small"
                />

                <Box sx={{ mt: 2, mb: 1 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Contact Channels Available
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="checkbox"
                      checked={formData.contact.phone}
                      onChange={(e) => handleContactChange('phone', e.target.checked)}
                    />
                    <span>Phone Call</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="checkbox"
                      checked={formData.contact.whatsapp}
                      onChange={(e) => handleContactChange('whatsapp', e.target.checked)}
                    />
                    <span>WhatsApp</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="checkbox"
                      checked={formData.contact.discord !== false && formData.contact.discord !== ''}
                      onChange={(e) =>
                        handleContactChange('discord', e.target.checked ? 'available' : false)
                      }
                    />
                    <span>Discord</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="checkbox"
                      checked={formData.contact.instagram !== false && formData.contact.instagram !== ''}
                      onChange={(e) =>
                        handleContactChange('instagram', e.target.checked ? '@handle' : false)
                      }
                    />
                    <span>Instagram</span>
                  </label>
                </Box>
              </Box>
            )}

            {/* Tab 2: Location */}
            {tabValue === 1 && (
              <Box sx={{ pt: 2 }}>
                {/* Home POI */}
                <Box sx={{ mb: 3 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Friend's Home Location
                  </Typography>
                  {formData.location.homePoiId ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <Chip
                        label={`📍 ${getPoiNameById(formData.location.homePoiId) || 'Loading...'}`}
                        size="small"
                        onDelete={() =>
                          setFormData((prev) => ({
                            ...prev,
                            location: { ...prev.location, homePoiId: '' },
                          }))
                        }
                      />
                    </Box>
                  ) : (
                    <Button
                      variant="outlined"
                      onClick={() => openPOIPicker('home')}
                      sx={{ textTransform: 'none', justifyContent: 'flex-start' }}
                    >
                      + Set Home Location (Select on Map)
                    </Button>
                  )}
                </Box>

                {/* Temporary Location */}
                <Box sx={{ mb: 3 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Temporary Location
                  </Typography>

                  {formData.location.temporaryLocation?.poiId ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                      <Chip
                        label={`📍 ${getPoiNameById(formData.location.temporaryLocation.poiId) || 'Loading...'}`}
                        size="small"
                        onDelete={() => handleTemporaryLocationChange('poiId', null)}
                      />
                    </Box>
                  ) : (
                    <Button
                      variant="outlined"
                      onClick={() => openPOIPicker('tempLocation')}
                      sx={{ textTransform: 'none', justifyContent: 'flex-start', mb: 2 }}
                    >
                      + Set Temporary Location (Select on Map)
                    </Button>
                  )}

                  {/* Temporary Location Dates */}
                  <Box sx={{ display: 'flex', gap: 2 }}>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="caption" display="block" gutterBottom>
                        Start Date
                      </Typography>
                      <Button
                        variant="outlined"
                        onClick={() => {
                          setShowCalendar('tempStart');
                          setCalendarDate(
                            formData.location.temporaryLocation?.startDate
                              ? dayjs(formData.location.temporaryLocation.startDate)
                              : dayjs()
                          );
                        }}
                        sx={{
                          textTransform: 'none',
                          justifyContent: 'flex-start',
                          width: '100%',
                          fontSize: '12px',
                          height: '36px',
                        }}
                      >
                        {formData.location.temporaryLocation?.startDate
                          ? dayjs(formData.location.temporaryLocation.startDate).format('MMM D, YYYY')
                          : 'Select start date'}
                      </Button>
                    </Box>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="caption" display="block" gutterBottom>
                        End Date
                      </Typography>
                      <Button
                        variant="outlined"
                        onClick={() => {
                          setShowCalendar('tempEnd');
                          setCalendarDate(
                            formData.location.temporaryLocation?.endDate
                              ? dayjs(formData.location.temporaryLocation.endDate)
                              : dayjs()
                          );
                        }}
                        sx={{
                          textTransform: 'none',
                          justifyContent: 'flex-start',
                          width: '100%',
                          fontSize: '12px',
                          height: '36px',
                        }}
                      >
                        {formData.location.temporaryLocation?.endDate
                          ? dayjs(formData.location.temporaryLocation.endDate).format('MMM D, YYYY')
                          : 'Select end date'}
                      </Button>
                    </Box>
                  </Box>

                  {/* Calendar Popup */}
                  {showCalendar && (
                    <Box
                      sx={{
                        position: 'absolute',
                        bottom: showCalendar === 'tempEnd' ? 120 : 'auto',
                        top: showCalendar === 'tempStart' ? 200 : 'auto',
                        left: 0,
                        zIndex: 10,
                        bgcolor: 'background.paper',
                        borderRadius: 2,
                        boxShadow: 3,
                        p: 2,
                      }}
                    >
                      <DateCalendar
                        value={calendarDate}
                        onChange={(newValue) => {
                          setCalendarDate(newValue);
                          handleCalendarChange(newValue);
                        }}
                        views={['year', 'month', 'day']}
                      />
                      <Box sx={{ mt: 1, display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                        <Button size="small" onClick={() => setShowCalendar(null)}>
                          Cancel
                        </Button>
                      </Box>
                    </Box>
                  )}
                </Box>
              </Box>
            )}

            {/* Tab 3: Logistics */}
            {tabValue === 2 && (
              <Box sx={{ pt: 2 }}>
                <Box sx={{ mb: 3 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Ride Logistics
                  </Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="checkbox"
                        checked={formData.logistics.canDrive}
                        onChange={(e) => handleLogisticsChange('canDrive', e.target.checked)}
                      />
                      🚗 Can Drive
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="checkbox"
                        checked={formData.logistics.pickupRequired}
                        onChange={(e) => handleLogisticsChange('pickupRequired', e.target.checked)}
                      />
                      🚌 Needs Ride
                    </label>
                  </Box>
                </Box>

                {formData.logistics.canDrive === false && formData.logistics.pickupRequired && (
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="subtitle2" gutterBottom>
                      Pickup Location
                    </Typography>
                    {formData.logistics.pickupPoiId ? (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <Chip
                          label={`📍 ${getPoiNameById(formData.logistics.pickupPoiId) || 'Loading...'}`}
                          size="small"
                          onDelete={() =>
                            setFormData((prev) => ({
                              ...prev,
                              logistics: { ...prev.logistics, pickupPoiId: '' },
                            }))
                          }
                        />
                      </Box>
                    ) : (
                      <Button
                        variant="outlined"
                        onClick={() => openPOIPicker('pickup')}
                        sx={{ textTransform: 'none', justifyContent: 'flex-start' }}
                      >
                        + Set Pickup Location (Select on Map)
                      </Button>
                    )}
                  </Box>
                )}
              </Box>
            )}

            {/* Tab 4: Notes */}
            {tabValue === 3 && (
              <Box sx={{ pt: 2 }}>
                <TextField
                  fullWidth
                  multiline
                  rows={4}
                  label="Logistics & Availability Notes"
                  placeholder="E.g. Has a car, can host, free on Saturday afternoons..."
                  value={formData.notes}
                  onChange={(e) => handleInputChange('notes', e.target.value)}
                  margin="normal"
                />
                <TextField
                  fullWidth
                  multiline
                  rows={3}
                  label="Planning Notes"
                  placeholder="Notes about planning hangouts, preferences, etc."
                  value={formData.planning.notes}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      planning: { ...prev.planning, notes: e.target.value },
                    }))
                  }
                  margin="normal"
                />
              </Box>
            )}

            {/* POI Picker Dialog */}
            {poiPickerMode && (
              <Dialog
                open={true}
                onClose={cancelPOISelection}
                maxWidth="md"
                fullWidth
                PaperProps={{ sx: { borderRadius: 2 } }}
              >
                <DialogTitle>Select or Create a Location</DialogTitle>
                <DialogContent>
                  {/* Existing POIs */}
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
                        {existingPOIs.map((poi) => (
                          <Box
                            key={poi.id}
                            onClick={() => handleSelectExistingPOI(poi.id)}
                            sx={{
                              p: 1.5,
                              cursor: 'pointer',
                              borderRadius: 1,
                              mb: 0.5,
                              bgcolor: selectedExistingPOI === poi.id ? 'action.selected' : 'transparent',
                              '&:hover': { bgcolor: 'action.hover' },
                            }}
                          >
                            <Typography variant="body2">{poi.name}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {poi.location?.address || `${poi.location?.lat}, ${poi.location?.lng}`}
                            </Typography>
                          </Box>
                        ))}
                        {existingPOIs.length === 0 && (
                          <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                            No existing locations found. Search below to create a new one.
                          </Typography>
                        )}
                      </Box>
                    )}
                  </Box>

                  {/* Create New via Map component */}
                  <Box sx={{ mt: 2, borderTop: '1px solid #e0e0e0', pt: 2 }}>
                    <Typography variant="subtitle2" gutterBottom>
                      Create New Location
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                      Click the button below to open the map and create a new location.
                    </Typography>
                     <POICreateButton key={`poi-create-${poiPickerMode}`} mode={poiPickerMode} onPoiCreated={handleMapPoiCreated} />
                  </Box>
                </DialogContent>
                <DialogActions sx={{ p: 2, gap: 1 }}>
                  <Button onClick={cancelPOISelection}>Cancel</Button>
                  {selectedExistingPOI && (
                    <Button variant="contained" onClick={confirmPOISelection} autoFocus>
                      Use Selected Location
                    </Button>
                  )}
                </DialogActions>
              </Dialog>
            )}
          </form>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            sx={{ bgcolor: '#CC7A5C', '&:hover': { bgcolor: '#b86649' } }}
          >
            {editFriend ? 'Save Changes' : 'Add Friend'}
          </Button>
        </DialogActions>
      </Dialog>

      <GlobalStyles styles={{ '.MuiPaper-root': { borderRadius: '16px !important' } }} />
    </LocalizationProvider>
  );
}

/**
 * Sub-component: Button that opens a map for POI creation
 * Uses the existing POIBasedMap component from the project
 */
function POICreateButton({ mode, onPoiCreated }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="outlined"
        onClick={() => setOpen(true)}
        sx={{ textTransform: 'none', mt: 1 }}
       >
        + Create New Location on Map
       </Button>

       {open && (
        <SimpleMapPOIPicker
          mode={mode}
          onClose={() => setOpen(false)}
          onPoiCreated={onPoiCreated}
         />
       )}
    </>
   );
}

/**
 * Simple map POI picker using existing Google Maps library
 */
function SimpleMapPOIPicker({ mode, onClose, onPoiCreated }) {
  const [searchAddr, setSearchAddr] = useState('');
  const [selectedCoords, setSelectedCoords] = useState(null);
  const [mapLoaded, setMapLoaded] = useState(false);

   // Load Google Maps script
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

    return () => {
      document.head.removeChild(script);
     };
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

  const handleUseCenter = (map) => {
    if (!map) return;
    const center = map.getCenter();
    setSelectedCoords({ lat: center.lat(), lng: center.lng() });
   };

  const handleConfirm = () => {
    if (!selectedCoords) return;
    onPoiCreated({ location: selectedCoords });
    onClose();
   };

  return (
    <Dialog open={true} onClose={onClose} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: 2 } }}>
       <DialogTitle>Create New Location</DialogTitle>
       <DialogContent>
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
              options={{
                streetViewControl: false,
                mapTypeControl: false,
               }}
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
       </DialogContent>
       <DialogActions sx={{ p: 2, gap: 1 }}>
         <Button onClick={onClose}>Cancel</Button>
         <Button variant="outlined" onClick={() => {
           // Get center of map for new coords
         }}>
          Reset to Map Center
         </Button>
         <Button
          variant="contained"
          onClick={handleConfirm}
          disabled={!selectedCoords}
          autoFocus
         >
          Use This Location
         </Button>
       </DialogActions>
     </Dialog>
   );
}

