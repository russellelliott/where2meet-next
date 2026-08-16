import React, { useState, useRef } from 'react';
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
  CircularProgress,
  MenuItem,
  IconButton,
  InputAdornment,
  Autocomplete as MuiAutocomplete,
} from '@mui/material';
import { saveFriend, updateFriend, getFriends } from '../../lib/friendService';
import { auth, db } from '../../firebaseConfig';
import { collection, getDocs } from 'firebase/firestore';
import { toast } from 'react-toastify';
import { FaPhone, FaDiscord, FaInstagram } from 'react-icons/fa6';
import { FaLinkedin } from 'react-icons/fa';
import { IoLogoWhatsapp, IoIosLink } from 'react-icons/io';

/**
 * Build a map of POI ID → friend associations from the user's friends list.
 * Returns unique POIs with all friend names and relationship types.
 */
function buildFriendPoiMap(friends) {
  const poiMap = new Map();
  if (!Array.isArray(friends)) return poiMap;

  for (const friend of friends) {
    if (!friend.location && !friend.logistics) continue;

    // Home POI
    if (friend.location?.homePoiId) {
      if (!poiMap.has(friend.location.homePoiId)) {
        poiMap.set(friend.location.homePoiId, []);
      }
      poiMap.get(friend.location.homePoiId).push({
        friendId: friend.id,
        friendName: friend.name,
        type: 'home',
      });
    }

    // Temporary Location POI
    if (friend.location?.temporaryLocation?.poiId) {
      const poiId = friend.location.temporaryLocation.poiId;
      if (!poiMap.has(poiId)) {
        poiMap.set(poiId, []);
      }
      poiMap.get(poiId).push({
        friendId: friend.id,
        friendName: friend.name,
        type: 'temporary',
        startDate: friend.location.temporaryLocation.startDate || null,
        endDate: friend.location.temporaryLocation.endDate || null,
      });
    }

    // Pickup POI
    if (friend.logistics?.pickupPoiId) {
      if (!poiMap.has(friend.logistics.pickupPoiId)) {
        poiMap.set(friend.logistics.pickupPoiId, []);
      }
      poiMap.get(friend.logistics.pickupPoiId).push({
        friendId: friend.id,
        friendName: friend.name,
        type: 'pickup',
      });
    }
  }

  return poiMap;
}

/**
 * Format all associations for a single POI into a combined label string.
 * E.g.: "Friend A (home, temporary (Jan 1 - Mar 31), pickup) | Friend B (home)"
 */
function formatPoiFriendLabels(associations) {
  // Group by friendId
  const friendGroups = new Map();
  for (const assoc of associations) {
    if (!friendGroups.has(assoc.friendId)) {
      friendGroups.set(assoc.friendId, { name: assoc.friendName, types: [] });
    }
    friendGroups.get(assoc.friendId).types.push(assoc);
  }

  // Build labels
  const labels = [];
  for (const [, { name, types }] of friendGroups) {
    const typeLabels = types.map((t) => {
      if (t.type === 'home') return 'home';
      if (t.type === 'pickup') return 'pickup';
      if (t.type === 'temporary') {
        const start = t.startDate ? new Date(t.startDate).toLocaleDateString() : '';
        const end = t.endDate ? new Date(t.endDate).toLocaleDateString() : '';
        if (start && end) return `temporary (${start} - ${end})`;
        if (start) return `temporary (starts ${start})`;
        if (end) return `temporary (ends ${end})`;
        return 'temporary';
      }
      return t.type;
    });

    labels.push(`${name} (${typeLabels.join(', ')})`);
  }

  return labels.join(' | ');
}

/**
 * Format a single association entry for display in the POI picker list.
 */
function formatSingleAssociation(assoc) {
  if (assoc.type === 'home') return `${assoc.friendName} (home)`;
  if (assoc.type === 'pickup') return `${assoc.friendName} (pickup)`;
  if (assoc.type === 'temporary') {
    const start = assoc.startDate ? new Date(assoc.startDate).toLocaleDateString() : '';
    const end = assoc.endDate ? new Date(assoc.endDate).toLocaleDateString() : '';
    if (start && end) return `${assoc.friendName} (temporary (${start} - ${end}))`;
    if (start) return `${assoc.friendName} (temporary, starts ${start})`;
    if (end) return `${assoc.friendName} (temporary, ends ${end})`;
    return `${assoc.friendName} (temporary)`;
  }
  return assoc.friendName;
}

/**
 * FriendForm Component
 * Add/Edit a friend with location POI selection, temporary locations with dates
 */
export default function FriendForm({ onSave, onClose, editFriend = null }) {
  const [formData, setFormData] = useState({
    name: editFriend?.name || '',
    tagsInput: Array.isArray(editFriend?.tags) ? editFriend.tags.join(', ') : '',
     contact: {
        phone: editFriend?.contact?.phone || false,
        whatsapp: editFriend?.contact?.whatsapp || false,
        discord: typeof editFriend?.contact?.discord === 'string' ? editFriend.contact.discord : (editFriend?.contact?.discord || ''),
        instagram: typeof editFriend?.contact?.instagram === 'string' ? editFriend.contact.instagram : (editFriend?.contact?.instagram || ''),
        linkedin: typeof editFriend?.contact?.linkedin === 'string' ? editFriend.contact.linkedin : (editFriend?.contact?.linkedin || ''),
        website: typeof editFriend?.contact?.website === 'string' ? editFriend.contact.website : (editFriend?.contact?.website || ''),
        primary: editFriend?.contact?.primary || 'phone',
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

   // Local state for immediate checkbox toggle feedback (avoids React render delay)
   const [contactToggles, setContactToggles] = useState({
     discord: editFriend?.contact?.discord === true || (typeof editFriend?.contact?.discord === 'string' && editFriend?.contact?.discord.length > 0),
     instagram: editFriend?.contact?.instagram === true || (typeof editFriend?.contact?.instagram === 'string' && editFriend?.contact?.instagram.length > 0),
     linkedin: editFriend?.contact?.linkedin === true || (typeof editFriend?.contact?.linkedin === 'string' && editFriend?.contact?.linkedin.length > 0),
     website: editFriend?.contact?.website === true || (typeof editFriend?.contact?.website === 'string' && editFriend?.contact?.website.length > 0),
      });

   // State for last contact date calendar (separate from temp location calendars)
   const [lastContactCalendarOpen, setLastContactCalendarOpen] = useState(false);
   const [lastContactDate, setLastContactDate] = useState(dayjs());

    const [tabValue, setTabValue] = useState(0);
    const [showCalendar, setShowCalendar] = useState(null);
   const [calendarDate, setCalendarDate] = useState(dayjs());
   const [poiPickerMode, setPoiPickerMode] = useState(null);
   const [existingPOIs, setExistingPOIs] = useState([]);
   const [loadingPOIs, setLoadingPOIs] = useState(false);
   const [selectedExistingPOI, setSelectedExistingPOI] = useState(null);
   const [formErrors, setFormErrors] = useState({});

    // State for all tags from friends (for autocomplete suggestions)
   const [allTags, setAllTags] = useState([]);

    // State for friend POI associations (for Friend Locations section)
   const [friendPoiAssociations, setFriendPoiAssociations] = useState(new Map());
   const [friendsList, setFriendsList] = useState([]);

   // Search filter for POI picker
   const [poiSearchQuery, setPoiSearchQuery] = useState('');

   const loadExistingPOIsAndFriends = async () => {
     const user = auth.currentUser;
     if (!user) return;

     setLoadingPOIs(true);
     try {
       // Load POIs
       const poiSnapshot = await getDocs(collection(db, 'users', user.uid, 'poi'));
       const pois = poiSnapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
       setExistingPOIs(pois);

       // Load friends for building association map
       const friendsData = await getFriends(user.uid);
       const friendsArray = friendsData.map(({ data: friend }) => ({ id: friendsData.find(f => f.id === friend.id)?.id || friend.id, ...friend }));
       setFriendsList(friendsArray);

       // Build POI → friend associations map
       const assocMap = buildFriendPoiMap(friendsArray);
       setFriendPoiAssociations(assocMap);
     } catch (error) {
       console.error('Error loading POIs and friends:', error);
     } finally {
       setLoadingPOIs(false);
     }
   };

   // Load POIs on mount so existing addresses resolve immediately (fixes "Loading..." in edit mode)
   React.useEffect(() => {
     if (editFriend) {
       loadExistingPOIsAndFriends();
             }
           }, []);

    // Initialize last contact date from editFriend or today
   React.useEffect(() => {
     if (editFriend?.contact?.lastContactDate) {
       setLastContactDate(dayjs(editFriend.contact.lastContactDate));
         } else {
        setLastContactDate(dayjs());
         }
        }, [editFriend]);

   // Load all tags from user's friends for autocomplete suggestions
   React.useEffect(() => {
     const loadAllTags = async () => {
       const user = auth.currentUser;
       if (!user) return;

       try {
         const friendsData = await getFriends(user.uid);
         const tagsSet = new Set();
         friendsData.forEach(({ data: friend }) => {
           if (Array.isArray(friend.tags)) {
             friend.tags.forEach((tag) => tagsSet.add(tag));
             }
           });
         setAllTags(Array.from(tagsSet).sort());
         } catch (error) {
         console.error('Error loading friend tags:', error);
         }
       };

     loadAllTags();
     }, []);

    // Pre-select the existing POI when opening the picker for a specific field
   const openPOIPicker = async (mode) => {
     setPoiPickerMode(mode);
     setSelectedExistingPOI(null);
     setPoiSearchQuery('');
     await loadExistingPOIsAndFriends();

       // Pre-select the existing POI for this field if one exists
     if (mode === 'home' && formData.location?.homePoiId) {
       setSelectedExistingPOI(formData.location.homePoiId);
         } else if (mode === 'pickup' && formData.logistics?.pickupPoiId) {
       setSelectedExistingPOI(formData.logistics.pickupPoiId);
         } else if (mode === 'tempLocation' && formData.location?.temporaryLocation?.poiId) {
       setSelectedExistingPOI(formData.location.temporaryLocation.poiId);
         }
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
     setPoiSearchQuery('');
      };

   const cancelPOISelection = () => {
     setPoiPickerMode(null);
     setSelectedExistingPOI(null);
     setPoiSearchQuery('');
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

      // Use YYYY-MM-DD format for lastContactDate to avoid timezone issues
       const resolvedLastContactDate = lastContactDate?.isValid()
            ? lastContactDate.format('YYYY-MM-DD')
            : dayjs().format('YYYY-MM-DD');

     const parsedTags = formData.tagsInput
           .split(',')
           .map((tag) => tag.trim())
           .filter((tag) => tag.length > 0);

        // Build contact object per schema:
        // - phone: boolean
        // - whatsapp: boolean
        // - discord: string (handle) or false
        // - instagram: string (handle) or false
       const contactData = {
        phone: formData.contact.phone || false,
        whatsapp: formData.contact.whatsapp || false,
        discord: formData.contact.discord || false,
        instagram: formData.contact.instagram || false,
        linkedin: formData.contact.linkedin || false,
        website: formData.contact.website || false,
          primary: formData.contact.primary || 'phone',
        lastContactDate: resolvedLastContactDate,
            };

        // Build nested objects only when they have fields to avoid saving empty objects
       const locationObj = {
              ...((formData.location.homePoiId || '').length > 0 && { homePoiId: formData.location.homePoiId }),
               ...(formData.location.temporaryLocation?.poiId && {
            temporaryLocation: formData.location.temporaryLocation,
               }),
              };
       const logisticsObj = {
            canDrive: formData.logistics.canDrive,
            pickupRequired: formData.logistics.pickupRequired,
               ...(formData.logistics.pickupPoiId && { pickupPoiId: formData.logistics.pickupPoiId }),
              };
       const planningObj = {
                ...((formData.planning.notes?.trim() || '').length > 0 && { notes: formData.planning.notes.trim() }),
              };

     const friendData = {
       name: formData.name.trim(),
       tags: parsedTags,
       contact: contactData,
           // Only include nested objects when they have actual fields
          ...((Object.keys(locationObj).length > 0) && { location: locationObj }),
          ...((Object.keys(logisticsObj).length > 0) && { logistics: logisticsObj }),
          ...((Object.keys(planningObj).length > 0) && { planning: planningObj }),
            // Only include top-level notes when set (Firebase rejects undefined)
            ...((formData.notes?.trim() || '').length > 0 && { notes: formData.notes.trim() }),
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

   /**
    * Filter POIs based on search query.
    */
   const getFilteredPOIs = () => {
     if (!poiSearchQuery.trim()) return existingPOIs;
     const lower = poiSearchQuery.toLowerCase();
     return existingPOIs.filter((poi) =>
       poi.name?.toLowerCase().includes(lower) ||
       poi.location?.address?.toLowerCase().includes(lower)
     );
   };

   /**
    * Separate POIs into "Friend Locations" and "Existing Locations".
    */
   const separatePOISections = () => {
     const filteredPOIs = getFilteredPOIs();
     const friendPoiIds = new Set(friendPoiAssociations.keys());
     
     const friendLocationPOIs = [];
     const existingLocationPOIs = [];

     for (const poi of filteredPOIs) {
       if (friendPoiIds.has(poi.id)) {
         friendLocationPOIs.push(poi);
       } else {
         existingLocationPOIs.push(poi);
       }
     }

     return { friendLocationPOIs, existingLocationPOIs };
   };

   /**
    * Render contact channel toggle with icon styling.
    * Phone/WhatsApp = boolean toggle only (no text field)
    * Discord/Instagram = boolean toggle + text field for handle when checked
    */
   const renderContactChannel = (channel, label, Icon, color, placeholder) => {
           // Use formData for initial state / persistence
     const persistedChecked = formData.contact[channel] === true ||
           (typeof formData.contact[channel] === 'string' && formData.contact[channel].length > 0);

             // For Discord/Instagram/LinkedIn/Website, use local toggle state for immediate feedback
     const isToggled = (channel === 'discord' || channel === 'instagram' || channel === 'linkedin' || channel === 'website')
             ? contactToggles[channel] ?? persistedChecked
            : persistedChecked;

     const handleToggleClick = () => {
          // Update local toggle immediately for visual feedback
        if (channel === 'discord' || channel === 'instagram' || channel === 'linkedin' || channel === 'website') {
          setContactToggles((prev) => {
            const newVal = !prev[channel];
              // When toggling on, don't overwrite the string value - just show the field
              // When toggling off, preserve the current string value (don't clear it)
            if (!newVal) {
                // Toggling off: set to false so the field disappears but keep string for next toggle
              handleContactChange(channel, formData.contact[channel] || '');
              }
            return { ...prev, [channel]: newVal };
            });
          } else {
            // Phone/WhatsApp: direct boolean toggle
          const val = !persistedChecked;
          handleContactChange(channel, val);
          }
        };

         // For Discord/Instagram/LinkedIn/Website, use the channel-specific value directly
     const socialValue = (channel === 'discord' || channel === 'instagram' || channel === 'linkedin' || channel === 'website') && isToggled
             ? formData.contact[channel] || ''
             : '';

     return (
            <Box key={channel} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5, borderRadius: 2, backgroundColor: '#FBFBF9' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Icon size={18} color={color} />
                <Typography variant="body2" sx={{ fontWeight: 500 }}>{label}</Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, maxWidth: 260 }}>
                 <input
             type="checkbox"
             checked={isToggled}
             onChange={handleToggleClick}
             style={{ cursor: 'pointer' }}
                 />
                    {(channel === 'discord' || channel === 'instagram' || channel === 'linkedin' || channel === 'website') && isToggled && (
                    <TextField
               size="small"
               fullWidth
               placeholder={placeholder}
               value={socialValue}
               onChange={(e) => handleContactChange(channel, e.target.value)}
               sx={{
                         '& .MuiOutlinedInput-root': { fontSize: '12px', height: 32 },
                       }}
                     />
                  )}
               </Box>
             </Box>
           );
        };

   const { friendLocationPOIs, existingLocationPOIs } = separatePOISections();

   return (
        <LocalizationProvider dateAdapter={AdapterDayjs}>
           <Dialog
         open={true}
         onClose={onClose}
         maxWidth="sm"
         fullWidth
         PaperProps={{ sx: { borderRadius: 3, backgroundColor: '#FBFBF9', maxHeight: '85vh' } }}
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
                   <Tab label="Last Contact" />
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

                        <MuiAutocomplete
                     multiple
                     freeSolo
                     options={allTags || []}
                     value={(typeof formData.tagsInput === 'string' && formData.tagsInput.trim().length > 0
                                 ? formData.tagsInput.split(',').map((t) => t.trim()).filter(Boolean)
                                  : [])}
                     onChange={(event, newValue) => {
                       setFormData((prev) => ({
                                  ...prev,
                         tagsInput: Array.isArray(newValue) && newValue.length > 0 ? newValue.join(', ') : ''
                                 }));
                               }}
                      renderInput={(params) => (
                              <TextField
                                 {...params}
                          label="Tags"
                          placeholder="Type a tag and press Enter"
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
                   size="small"
                     >
                       <MenuItem value="phone">Phone Call</MenuItem>
                       <MenuItem value="discord">Discord</MenuItem>
                       <MenuItem value="whatsapp">WhatsApp</MenuItem>
                       <MenuItem value="instagram">Instagram</MenuItem>
                       <MenuItem value="linkedin">LinkedIn</MenuItem>
                       <MenuItem value="website">Website</MenuItem>
                     </TextField>

                     {/* Contact Channels - New approach per schema */}
                    <Box sx={{ mt: 2, mb: 1.5 }}>
                      <Typography variant="subtitle2" gutterBottom>
                     Contact Channels Available
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block">
                     Toggle channels on and off. Discord and Instagram require a handle when enabled.
                      </Typography>
                    </Box>

                    {/* Phone - toggle only, no handle text */}
                    {renderContactChannel(
                      'phone',
                      'Phone Call',
                   FaPhone,
                      '#666666',
                      '+1 (555) 000-0000'
                    )}

                    {/* WhatsApp - toggle only, no handle text */}
                    {renderContactChannel(
                      'whatsapp',
                      'WhatsApp',
                   IoLogoWhatsapp,
                      '#25D366',
                      '+1 (555) 000-0000'
                    )}

                    {/* Discord - toggle + handle text field */}
                    {renderContactChannel(
                      'discord',
                      'Discord',
                   FaDiscord,
                      '#5865F2',
                      'username#1234'
                    )}

                      {/* Instagram - toggle + handle text field */}
                      {renderContactChannel(
                        'instagram',
                        'Instagram',
                   FaInstagram,
                        '#8a49a1',
                        '@insta_handle'
                      )}

                      {/* LinkedIn - toggle + handle text field */}
                      {renderContactChannel(
                        'linkedin',
                        'LinkedIn',
                   FaLinkedin,
                        '#0072b1',
                        'https://linkedin.com/in/username'
                      )}

                      {/* Website - toggle + handle text field */}
                      {renderContactChannel(
                        'website',
                        'Website',
                   IoIosLink,
                        '#e85d3a',
                        'https://example.com'
                      )}
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
                         label={`\uD83D\uDccd ${getPoiNameById(formData.location.homePoiId) || 'Loading...'}`}
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
                         label={`\uD83D\uDccd ${getPoiNameById(formData.location.temporaryLocation.poiId) || 'Loading...'}`}
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

                        {/* Temporary Location Dates — only show when a temp location POI is set */}
                        {formData.location.temporaryLocation?.poiId && (
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
                        )}

              {/* Calendar popup — render inline below the date buttons */}
                          {showCalendar && (
                            <Box sx={{ mt: 1, mb: 2 }}>
                              <DateCalendar
                               value={calendarDate}
                               onChange={(newValue) => {
                                 setCalendarDate(newValue);
                                 handleCalendarChange(newValue);
                                }}
                               views={['year', 'month', 'day']}
                              />
                              <Box sx={{ mt: 1, display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                                <Button size="small" onClick={() => setShowCalendar(null)}>Cancel</Button>
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
                          \uD83D\uDE97 Can Drive
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <input
                         type="checkbox"
                         checked={formData.logistics.pickupRequired}
                         onChange={(e) => handleLogisticsChange('pickupRequired', e.target.checked)}
                          />
                          \uD83D\uDE8C Needs Ride
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
                           label={`\uD83D\uDccd ${getPoiNameById(formData.logistics.pickupPoiId) || 'Loading...'}`}
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

                   {/* Tab 5: Last Contact */}
                   {tabValue === 4 && (
                     <Box sx={{ pt: 2 }}>
                       <Typography variant="subtitle2" gutterBottom>
                     Last Time You Contacted Them
                       </Typography>
                       <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
                     Select a date below, or set it to today's date instantly.
                       </Typography>

                       {/* Quick action button */}
                       <Button
                     variant="outlined"
                     fullWidth
                     onClick={() => {
                       const now = dayjs();
                       setLastContactDate(now);
                       setFormData((prev) => ({
                             ...prev,
                         contact: { ...prev.contact, lastContactDate: now.format('YYYY-MM-DD') },
                           }));
                         }}
                     sx={{
                       textTransform: 'none',
                       justifyContent: 'flex-start',
                       mb: 2,
                       height: 48,
                         }}
                       >
                       \uD83D\uDCC5 Set to Today ({dayjs().format('MMM D, YYYY')})
                       </Button>

                       {/* Date Calendar */}
                       <Box sx={{ position: 'relative' }}>
                         <Typography variant="caption" display="block" gutterBottom>
                       Pick a Date
                         </Typography>
                         <DateCalendar
                       value={lastContactDate}
                       onChange={(newValue) => {
                         setLastContactDate(newValue);
                         if (newValue) {
                             // Format as YYYY-MM-DD for consistent timezone-agnostic storage
                           setFormData((prev) => ({
                                 ...prev,
                             contact: { ...prev.contact, lastContactDate: newValue.format('YYYY-MM-DD') },
                               }));
                             }
                           }}
                       views={['year', 'month', 'day']}
                       sx={{ mb: 1 }}
                         />
                       </Box>

                       {/* Display selected date */}
                       <Typography variant="caption" display="block" sx={{ mt: 1, color: '#1976d2' }}>
                     Selected: {lastContactDate ? lastContactDate.format('MMMM D, YYYY') : 'No date selected'}
                       </Typography>
                     </Box>
                   )}

                   {/* POI Picker Dialog */}
                {poiPickerMode && (
                  <Dialog
                 open={true}
                 onClose={cancelPOISelection}
                 maxWidth="lg"
                 fullWidth
                 PaperProps={{ sx: { borderRadius: 2, maxHeight: '90vh', width: 600 } }}
                  >
                    <DialogTitle>Select a Location</DialogTitle>
                    <DialogContent>
                       {/* Search Bar */}
                      <Box sx={{ mb: 2 }}>
                        <TextField
                          fullWidth
                          placeholder="Search locations..."
                          value={poiSearchQuery}
                          onChange={(e) => setPoiSearchQuery(e.target.value)}
                          InputProps={{
                            startAdornment: (
                              <InputAdornment position="start">🔍</InputAdornment>
                            ),
                          }}
                          size="small"
                        />
                      </Box>

                       {/* Friend Locations Section */}
                      {friendLocationPOIs.length > 0 && (
                        <Box sx={{ mb: 2 }}>
                          <Typography variant="subtitle2" gutterBottom sx={{ color: '#1976d2' }}>
                            Friend Locations ({friendLocationPOIs.length})
                          </Typography>
                          {loadingPOIs ? (
                            <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                              <CircularProgress size={24} />
                            </Box>
                          ) : (
                            <Box sx={{ maxHeight: 180, overflowY: 'auto' }}>
                              {friendLocationPOIs.map((poi) => {
                                const associations = friendPoiAssociations[poi.id] || [];
                                return (
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
                                      border: selectedExistingPOI === poi.id ? '1px solid #1976d2' : '1px solid transparent',
                                    }}
                                  >
                                    <Typography variant="body2" fontWeight={selectedExistingPOI === poi.id ? 'bold' : 'regular'}>
                                      {poi.name}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary" display="block">
                                      {poi.location?.address || `${poi.location?.lat}, ${poi.location?.lng}`}
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: '#1976d2', display: 'block', mt: 0.5 }}>
                                      {formatPoiFriendLabels(associations)}
                                    </Typography>
                                  </Box>
                                );
                              })}
                            </Box>
                          )}
                        </Box>
                      )}

                       {/* Existing Locations Section */}
                      <Box sx={{ mb: 2 }}>
                        <Typography variant="subtitle2" gutterBottom>
                          Existing Locations ({existingLocationPOIs.length})
                        </Typography>
                        {loadingPOIs ? (
                          <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                            <CircularProgress size={24} />
                          </Box>
                        ) : (
                          <Box sx={{ maxHeight: 180, overflowY: 'auto' }}>
                            {existingLocationPOIs.map((poi) => (
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
                                  border: selectedExistingPOI === poi.id ? '1px solid #1976d2' : '1px solid transparent',
                                }}
                              >
                                <Typography variant="body2">{poi.name}</Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {poi.location?.address || `${poi.location?.lat}, ${poi.location?.lng}`}
                                </Typography>
                              </Box>
                            ))}
                            {existingLocationPOIs.length === 0 && (
                              <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                                No existing locations found. Search above to find one.
                              </Typography>
                            )}
                          </Box>
                        )}
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
             sx={{
               backgroundColor: '#1976d2',
                 '&:hover': { backgroundColor: '#1565c0' },
                }}
              >
                {editFriend ? 'Save Changes' : 'Add Friend'}
              </Button>
            </DialogActions>
          </Dialog>
        </LocalizationProvider>
      );
    }