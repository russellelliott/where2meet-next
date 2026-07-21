import React, { useState } from 'react';
import {
  Box,
  TextField,
  InputAdornment,
  MenuItem,
  Typography,
  Chip,
  IconButton,
  Paper,
  Button,
  Popover,
} from '@mui/material';
import { Search, Tag, Car, AlertTriangle, Trash2, Plus, UserX, MapPin, Pencil, Calendar } from 'lucide-react';
import { FaPhone } from 'react-icons/fa6';
import { FaDiscord, FaInstagram } from 'react-icons/fa';
import { IoLogoWhatsapp } from 'react-icons/io';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DateCalendar } from '@mui/x-date-pickers/DateCalendar';
import dayjs from 'dayjs';

/**
 * Convert a stored lastContactDate value to a local dayjs date for calendar display.
 * Handles both old full ISO strings ("2026-07-31T23:00:00.000Z") and new YYYY-MM-DD format.
 * For YYYY-MM-DD, uses the local constructor so no UTC conversion occurs.
 */
function parseLastContactDateToLocal(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return dayjs();

     // New format: plain YYYY-MM-DD — construct local midnight directly
   if (dateStr.length === 10) {
     const [year, month, day] = dateStr.split('-').map(Number);
     return dayjs(new Date(year, month - 1, day, 0, 0, 0, 0));
     }

     // Old format: full ISO string — derive local date key first
   const d = new Date(dateStr);
   const yearOld = d.getUTCFullYear();
   const monthOld = d.getUTCMonth();
   const dayOld = d.getUTCDate();
   return dayjs(new Date(yearOld, monthOld, dayOld, 0, 0, 0, 0));
}

/**
   * Format a date string (YYYY-MM-DD or ISO) to mm/dd/yyyy.
   */
  function formatDate(dateStr) {
    if (!dateStr) return '';
    let d;
    if (dateStr.length === 10) {
      const [year, month, day] = dateStr.split('-');
      d = new Date(year, parseInt(month, 10) - 1, parseInt(day, 10));
    } else {
      d = new Date(dateStr);
    }
    if (isNaN(d.getTime())) return '';
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
  }

  /**
   * Format the temporary location date range as mm/dd/yyyy-mm/dd/yyyy.
   */
  function formatDateRange(startDate, endDate) {
    const start = formatDate(startDate);
    const end = formatDate(endDate);
    if (start && end) return `(${start}-${end})`;
    return '';
  }

  /**
   * Check if today's date falls within the temporary location's date range.
   */
  function isTempLocationActive(tempLocation) {
    if (!tempLocation || !tempLocation.startDate && !tempLocation.endDate) return false;
    const today = new Date();
    const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    let startdate;
    if (tempLocation.startDate) {
      if (tempLocation.startDate.length === 10) {
        const [year, month, day] = tempLocation.startDate.split('-');
        startdate = new Date(year, parseInt(month, 10) - 1, parseInt(day, 10));
      } else {
        startdate = new Date(tempLocation.startDate);
      }
    }

    let enddate;
    if (tempLocation.endDate) {
      if (tempLocation.endDate.length === 10) {
        const [year, month, day] = tempLocation.endDate.split('-');
        enddate = new Date(year, parseInt(month, 10) - 1, parseInt(day, 10));
      } else {
        enddate = new Date(tempLocation.endDate);
      }
    }

    const inRange = [];
    if (startdate && enddate) {
      inRange.push(todayDate >= new Date(startdate.getFullYear(), startdate.getMonth(), startdate.getDate()) && todayDate <= new Date(enddate.getFullYear(), enddate.getMonth(), enddate.getDate()));
    } else if (startdate) {
      inRange.push(todayDate >= new Date(startdate.getFullYear(), startdate.getMonth(), startdate.getDate()));
    } else if (enddate) {
      inRange.push(todayDate <= new Date(enddate.getFullYear(), enddate.getMonth(), enddate.getDate()));
    }

    return inRange.some(Boolean);
  }

  /**
   * Resolve a POI to its display address.
   */
  function resolvePoiAddress(poiId, pois, cityCache) {
    if (!poiId) return null;
    const poi = Array.isArray(pois) ? pois.find((p) => p.id === poiId) : null;
    if (poi) {
      if (poi.location?.address) return poi.location.address;
      if (poi.location?.lat && poi.location?.lng) return `${poi.location.lat.toFixed(4)}, ${poi.location.lng.toFixed(4)}`;
    }
    if (cityCache && cityCache[poiId]) return cityCache[poiId];
    return null;
  }

  /**
   * Helper to resolve friend location display from POI data.
   * Returns an object with homeAddress, tempAddress, tempDateRange, and isActive flags.
   */
  function resolveFriendLocation(friendLoc, pois, cityCache) {
    const result = {
      homeAddress: null,
      tempAddress: null,
      tempDateRange: '',
      isTempActive: false,
    };

    if (friendLoc?.homePoiId) {
      result.homeAddress = resolvePoiAddress(friendLoc.homePoiId, pois, cityCache);
      if (!result.homeAddress) result.homeAddress = 'Home set';
    }

    if (friendLoc?.temporaryLocation) {
      const tempLocation = friendLoc.temporaryLocation;
      result.tempAddress = resolvePoiAddress(tempLocation.poiId, pois, cityCache);
      if (!result.tempAddress) result.tempAddress = 'Temporary location';
      result.isTempActive = isTempLocationActive(tempLocation);
      result.tempDateRange = formatDateRange(tempLocation.startDate, tempLocation.endDate);
    }

    return result;
  }

export default function FriendList({
  friends,
  cityCache,
  pois,
  selectedFriendId,
  onSelectFriend,
  onRecordContact,
  onDeleteFriend,
  onOpenDeleteConfirm,
  onSetLastContactDate,
  onEditFriend,
  onToggleAddForm,
  onOpenPlaceIdeasPicker,
  isAddFormOpen,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStaleness, setSelectedStaleness] = useState('all');
  const [selectedLogistics, setSelectedLogistics] = useState('all');

    // Calendar popover state per friend
  const [calendarAnchor, setCalendarAnchor] = useState(null);
  const [calendarFriendId, setCalendarFriendId] = useState(null);
  const [calendarDate, setCalendarDate] = useState(dayjs());

  /**
   * Calculate days since contact using local calendar dates only.
   * Both the stored YYYY-MM-DD date and "now" are parsed as local midnight (no UTC conversion)
   * so the difference correctly reflects calendar day count.
   */
  const getDaysSinceContact = (dateStr) => {
    if (!dateStr) return 999;

        // Parse stored date as local midnight (YYYY-MM-DD → local year/month/day)
     let lastLocal;
     if (dateStr.length === 10) {
       const [year, month, day] = dateStr.split('-').map(Number);
       lastLocal = new Date(year, month - 1, day, 0, 0, 0, 0);
       } else {
       // Handle full ISO strings by extracting local date
       const d = new Date(dateStr);
       lastLocal = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
       }

        // "Now" as local midnight (drop time component)
     const now = new Date();
     const nowLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

     const diffTime = nowLocal.getTime() - lastLocal.getTime();
     const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
     return isNaN(diffDays) ? 0 : diffDays;
    };

  const getStalenessCategory = (days) => {
    if (days <= 7) return 'fresh';
    if (days <= 30) return 'stale';
    return 'overdue';
    };

  const filteredFriends = friends.filter((friend) => {
    const matchesSearch =
      friend.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      friend.tags?.some((t) => t.toLowerCase().includes(searchTerm.toLowerCase()));

    const days = getDaysSinceContact(friend.contact?.lastContactDate);
    const category = getStalenessCategory(days);
    const matchesStaleness = selectedStaleness === 'all' || category === selectedStaleness;

    const matchesLogistics =
      selectedLogistics === 'all' ||
       (selectedLogistics === 'can_drive' && friend.logistics?.canDrive) ||
       (selectedLogistics === 'needs_ride' && friend.logistics?.pickupRequired);

    return matchesSearch && matchesStaleness && matchesLogistics;
    });

  const handleOpenCalendar = (event, friendId) => {
    event.stopPropagation();
    setCalendarAnchor(event.currentTarget);
    setCalendarFriendId(friendId);
    const friend = friends.find((f) => f.id === friendId);
        // Use parseLastContactDateToLocal to correctly display the stored date as local calendar day
    setCalendarDate(friend?.contact?.lastContactDate
          ? parseLastContactDateToLocal(friend.contact.lastContactDate)
          : dayjs());
      };

  const handleCloseCalendar = () => {
    setCalendarAnchor(null);
    setCalendarFriendId(null);
    };

  const handleCalendarSelect = (newValue) => {
    setCalendarDate(newValue);
    };

  const handleConfirmCalendarDate = () => {
    if (!calendarFriendId) return;
    const dateStr = calendarDate.format('YYYY-MM-DD');
    if (onSetLastContactDate) {
      onSetLastContactDate(calendarFriendId, dateStr);
      } else if (onRecordContact) {
      onRecordContact(calendarFriendId, dateStr);
      }
    handleCloseCalendar();
    };

  const renderContactIcon = (friend) => {
    const primary = friend.contact?.primary || 'phone';
    const handle = friend.contact?.handle || '';
    const iconStyle = { cursor: 'default', display: 'flex', alignItems: 'center', gap: 0.5 };

    if (primary === 'discord') {
      return (
          <Box sx={iconStyle}>
            <FaDiscord size={18} color="#5865F2" />
            {handle && (
              <Typography variant="caption" sx={{ fontSize: '10px', color: '#5865F2', fontWeight: 600 }}>
                {handle}
              </Typography>
            )}
          </Box>
        );
      }
    if (primary === 'whatsapp') {
      return (
          <Box sx={iconStyle}>
            <IoLogoWhatsapp size={18} color="#25D366" />
          </Box>
        );
      }
    if (primary === 'instagram') {
      return (
          <Box sx={iconStyle}>
            <FaInstagram size={18} color="#8a49a1" />
            {handle && (
              <Typography variant="caption" sx={{ fontSize: '10px', color: '#8a49a1', fontWeight: 600 }}>
                {handle}
              </Typography>
            )}
          </Box>
        );
      }
    return (
        <Box sx={iconStyle}>
          <FaPhone size={14} color="#666666" />
        </Box>
      );
    };

  const getStalenessColor = (category) => {
    switch (category) {
      case 'fresh': return { bg: '#e8f5e9', color: '#1b5e20', borderColor: '#c8e6c9' };
      case 'stale': return { bg: '#fff8e1', color: '#f57f17', borderColor: '#ffecb3' };
      case 'overdue': return { bg: '#ffebee', color: '#c62828', borderColor: '#ffcdd2' };
      default: return { bg: '#f5f5f5', color: '#616161', borderColor: '#e0e0e0' };
      }
    };

  const getCardStyles = (category, isSelected) => {
    if (isSelected) {
      return {
        border: '2px solid #CC7A5C',
        boxShadow: '0 0 0 4px rgba(204, 122, 92, 0.15)',
        backgroundColor: '#FBFBF9',
        };
      }
    switch (category) {
      case 'fresh':
        return { border: '1px solid #c8e6c9', '&:hover': { borderColor: '#81c784' } };
      case 'stale':
        return { border: '1px solid #ffecb3', '&:hover': { borderColor: '#ffd54f' } };
      case 'overdue':
        return { border: '1px solid #ffcdd2', '&:hover': { borderColor: '#ef9a9a' } };
      default:
        return { border: '1px solid #e0e0e0', '&:hover': { borderColor: '#CC7A5C' } };
      }
    };

       // Open calendar popover for a friend
  const handleOpenCalendarCalendar = (event, friendId) => {
    event.stopPropagation();
    setCalendarAnchor(event.currentTarget);
    setCalendarFriendId(friendId);
    const friend = friends.find((f) => f.id === friendId);
        // Use parseLastContactDateToLocal to correctly display the stored date as local calendar day
    setCalendarDate(friend?.contact?.lastContactDate
          ? parseLastContactDateToLocal(friend.contact.lastContactDate)
          : dayjs());
       };

    // Confirm calendar date selection - save as YYYY-MM-DD
  const handleConfirmCalendarSelect = () => {
    if (!calendarFriendId) return;
      // Format as date-only string YYYY-MM-DD
    const dateStr = calendarDate.format('YYYY-MM-DD');
    if (onSetLastContactDate) {
      onSetLastContactDate(calendarFriendId, dateStr);
      } else if (onRecordContact) {
        // Fallback: reuse onRecordContact with the date string - pass through parent
      onRecordContact(calendarFriendId, dateStr);
      }
    handleCloseCalendar();
    };

  return (
      <Paper
      sx={{
        borderRadius: 3,
        p: 2.5,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid #EBE9E2',
        backgroundColor: '#FFFFFF',
        }}
      id="friend-list-card"
      >
        {/* Search & Filters Header */}
        <Box sx={{ mb: 2.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
            <Typography variant="h6" sx={{ fontFamily: 'serif', fontWeight: 700, color: '#2D2D20', fontSize: '1rem' }}>
            Friends Directory
            </Typography>
            <Chip
            label={`${filteredFriends.length} listed`}
            size="small"
            sx={{
              backgroundColor: '#5A5A4010',
              color: '#5A5A40',
              fontWeight: 700,
              fontFamily: 'monospace',
              fontSize: '10px',
              }}
            />
            <Button
            variant="contained"
            onClick={onToggleAddForm}
            size="small"
            startIcon={<Plus size={16} />}
            sx={{
              backgroundColor: isAddFormOpen ? '#F0EEE6' : '#CC7A5C',
              color: isAddFormOpen ? '#2D2D20' : '#FFFFFF',
                '&:hover': {
                backgroundColor: isAddFormOpen ? '#E0DED7' : '#b86649',
                },
              textTransform: 'none',
              fontSize: '12px',
              fontWeight: 600,
              borderRadius: 2,
              }}
            id="toggle-add-friend"
            >
              {isAddFormOpen ? 'Close Form' : 'Add Friend'}
            </Button>
          </Box>

          {/* Search Bar */}
          <TextField
          fullWidth
          size="small"
          placeholder="Search by name or tag (e.g. 'Hiking')..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: (
                <InputAdornment position="start">
                  <Search size={16} color="#9B988C" />
                </InputAdornment>
              ),
            sx: {
              backgroundColor: '#FBFBF9',
              borderRadius: 2,
              borderColor: '#EBE9E2',
                '&.Mui-focused': { borderColor: '#CC7A5C' },
              }
            }}
          id="friend-search-input"
          />

          {/* Filters Row */}
          <Box sx={{ display: 'flex', gap: 1.5, mt: 1.5 }}>
            {/* Contact Staleness */}
            <Box sx={{ flex: 1 }}>
              <Typography variant="caption" sx={{ display: 'block', fontFamily: 'monospace', fontSize: '9px', textTransform: 'uppercase', fontWeight: 700, color: '#7D7B6D', mb: 0.5 }}>
              Contact Staleness
              </Typography>
              <TextField
              select
              size="small"
              fullWidth
              value={selectedStaleness}
              onChange={(e) => setSelectedStaleness(e.target.value)}
              sx={{
                backgroundColor: '#F9F8F6',
                borderRadius: 1,
                borderColor: '#EBE9E2',
                }}
              id="friend-staleness-select"
              >
                <MenuItem value="all">All Channels</MenuItem>
                <MenuItem value="fresh">Fresh (≤7 days)</MenuItem>
                <MenuItem value="stale">Stale (8-30 days)</MenuItem>
                <MenuItem value="overdue">Overdue ({'>'}30 days)</MenuItem>
              </TextField>
            </Box>

            {/* Ride Logistics */}
            <Box sx={{ flex: 1 }}>
              <Typography variant="caption" sx={{ display: 'block', fontFamily: 'monospace', fontSize: '9px', textTransform: 'uppercase', fontWeight: 700, color: '#7D7B6D', mb: 0.5 }}>
              Ride Logistics
              </Typography>
              <TextField
              select
              size="small"
              fullWidth
              value={selectedLogistics}
              onChange={(e) => setSelectedLogistics(e.target.value)}
              sx={{
                backgroundColor: '#F9F8F6',
                borderRadius: 1,
                borderColor: '#EBE9E2',
                }}
              id="friend-logistics-select"
              >
                <MenuItem value="all">All Logistics</MenuItem>
                <MenuItem value="can_drive">🚗 Self-Drive</MenuItem>
                <MenuItem value="needs_ride">🚌 Needs Ride</MenuItem>
              </TextField>
            </Box>
          </Box>
        </Box>

        {/* Friends Grid - Scroll Area */}
        <Box sx={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1.5, pr: 0.5 }}>
          {filteredFriends.map((friend) => {
          const days = getDaysSinceContact(friend.contact?.lastContactDate);
          const category = getStalenessCategory(days);
          const isSelected = selectedFriendId === friend.id;
          const cardStyles = getCardStyles(category, isSelected);

          const locationData = resolveFriendLocation(friend.location, pois, cityCache);

          return (
              <Paper
              key={friend.id}
              onClick={() => onSelectFriend(friend.id === selectedFriendId ? null : friend.id)}
              sx={{
                p: 2,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                borderRadius: 2,
                   ...cardStyles,
                 }}
              id={`friend-row-${friend.id}`}
              >
                 {/* Top Row: Name + Days Ago */}
                 <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                   {/* Left: Name & Location */}
                   <Box sx={{ flex: 1, minWidth: 0 }}>
                     <Typography variant="body2" sx={{ fontFamily: 'serif', fontWeight: 700, color: '#2D2D20', fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                       {friend.name}
                     </Typography>
                     {/* Home POI Address */}
                     <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25, flexWrap: 'wrap' }}>
                       <MapPin size={12} color="#9B988C" />
                       <Typography
                         variant="caption"
                         sx={{
                           color: '#7D7B6D',
                           fontSize: '11px',
                           textDecoration: locationData.isTempActive ? 'line-through' : 'none',
                         }}
                       >
                         {locationData.homeAddress}
                       </Typography>
                     </Box>
                      {/* Temporary Location Address + Date Range */}
                      {locationData.tempAddress && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25, flexWrap: 'wrap' }}>
                          <Typography
                           variant="caption"
                           sx={{
                             color: friend.logistics?.canDrive ? '#1e8544' : '#CC7A5C',
                             fontSize: '11px',
                             fontStyle: 'italic',
                            }}
                          >
                            {locationData.tempAddress}
                          </Typography>
                          {locationData.tempDateRange && (
                            <Typography
                             variant="caption"
                             sx={{
                               color: friend.logistics?.canDrive ? '#1e8544' : '#CC7A5C',
                               fontSize: '10px',
                               fontFamily: 'monospace',
                              }}
                            >
                              {locationData.tempDateRange}
                            </Typography>
                          )}
                        </Box>
                      )}
                   </Box>

                  {/* Right: Days Ago + Contact Icon */}
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5 }}>
                    <Chip
                    label={days <= 0 ? 'Contacted today' : `${days}d ago`}
                    size="small"
                    sx={{
                      backgroundColor: getStalenessColor(category).bg,
                      color: getStalenessColor(category).color,
                      fontWeight: 700,
                      fontFamily: 'monospace',
                      fontSize: '10px',
                      height: 20,
                      border: `1px solid ${getStalenessColor(category).borderColor}`,
                      }}
                    />
                    {renderContactIcon(friend)}
                  </Box>
                </Box>

                {/* Tags & Handle Row */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1.25 }}>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {friend.tags?.map((tag) => (
                      <Chip
                      key={tag}
                      label={tag}
                      size="small"
                      icon={<Tag size={10} color="#9B988C" />}
                      sx={{
                        backgroundColor: '#F9F8F6',
                        color: '#5A5A40',
                        fontSize: '9px',
                        height: 20,
                        border: '1px solid #EBE9E2',
                        }}
                      />
                    ))}
                  </Box>
                  {friend.contact?.handle && (
                    <Typography variant="caption" sx={{ fontFamily: 'monospace', color: '#7D7B6D', fontSize: '11px', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {friend.contact.handle}
                    </Typography>
                  )}
                </Box>

                {/* Bottom Row: Logistics + Actions */}
                <Box sx={{ borderTop: '1px solid #F2F0EA', pt: 1.25, mt: 1.25, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    {friend.logistics?.canDrive ? (
                      <Typography variant="caption" sx={{ color: '#1e8544', fontWeight: 600, fontFamily: 'monospace', fontSize: '11px' }}>
                        <Car size={14} /> 🚗 Self-Drive
                      </Typography>
                    ) : friend.logistics?.pickupRequired ? (
                      <Typography variant="caption" sx={{ color: '#CC7A5C', fontWeight: 600, fontFamily: 'monospace', fontSize: '11px' }}>
                        <AlertTriangle size={14} color="#CC7A5C" /> 🚌 Needs ride
                      </Typography>
                    ) : (
                      <Typography variant="caption" sx={{ color: '#7D7B6D', fontFamily: 'monospace', fontSize: '11px' }}>
                      No logistics info
                      </Typography>
                    )}
                  </Box>

      <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                        {/* Calendar Icon Button */}
                    <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenCalendarCalendar(e, friend.id);
                      }}
                    sx={{
                      color: '#9B988C',
                        '&:hover': { color: '#5A5A40', backgroundColor: '#FBFBF9' },
                      }}
                    title="Set Last Contact Date"
                    id={`last-contact-${friend.id}`}
                    >
                      <Calendar size={14} />
                    </IconButton>

                    {/* Edit Button */}
                    <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditFriend?.(friend);
                      }}
                    sx={{
                      color: '#9B988C',
                        '&:hover': { color: '#5A5A40', backgroundColor: '#FBFBF9' },
                      }}
                    title="Edit Friend"
                    id={`edit-friend-${friend.id}`}
                    >
                      <Pencil size={14} />
                    </IconButton>

                      {/* Delete Button */}
                      <IconButton
                     size="small"
                     onClick={(e) => {
                       e.stopPropagation();
                       // Use the confirmation dialog handler if available, otherwise direct delete
                       onOpenDeleteConfirm ? onOpenDeleteConfirm(friend.id) : onDeleteFriend(friend.id);
                        }}
                     sx={{
                       color: '#9B988C',
                          '&:hover': { color: '#CC7A5C', backgroundColor: '#FBFBF9' },
                        }}
                     title="Remove Friend"
                     id={`delete-friend-${friend.id}`}
                      >
                        <Trash2 size={14} />
                      </IconButton>
                  </Box>
                </Box>

                {/* Logistics details for selected */}
                {isSelected && friend.logistics?.notes && (
                  <Typography variant="caption" sx={{ display: 'block', mt: 1, color: '#7D7B6D', fontStyle: 'italic', fontSize: '11px' }}>
                    {'Note: "'}{friend.logistics.notes}{'"'}
                  </Typography>
                )}
              </Paper>
            );
          })}

          {filteredFriends.length === 0 && (
             <Box sx={{ textAlign: 'center', py: 6, px: 4, backgroundColor: '#FBFBF9', border: '1px dashed #E0DED7', borderRadius: 2 }}>
               <UserX size={32} color="#9B988C60" />
               <Typography variant="body2" sx={{ color: '#9B988C', mt: 1, fontSize: '13px' }}>
              No friends match the search or filter settings.
               </Typography>
             </Box>
           )}
         </Box>

         {/* Calendar Popover */}
         <Popover
        open={Boolean(calendarAnchor)}
        anchorEl={calendarAnchor}
        onClose={handleCloseCalendar}
        anchorOrigin={{
          vertical: 'top',
          horizontal: 'left',
          }}
        transformOrigin={{
          vertical: 'bottom',
          horizontal: 'left',
          }}
        sx={{ mt: 1 }}
         >
           <Box sx={{ p: 2 }}>
             <LocalizationProvider dateAdapter={AdapterDayjs}>
               <DateCalendar
              value={calendarDate}
              onChange={handleCalendarSelect}
              views={['year', 'month', 'day']}
               />
               <Box sx={{ mt: 1, display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                 <Button size="small" onClick={handleCloseCalendar}>Cancel</Button>
                 <Button size="small" variant="contained" onClick={handleConfirmCalendarSelect}>
                Confirm
                 </Button>
               </Box>
             </LocalizationProvider>
           </Box>
         </Popover>
       </Paper>
     );
}