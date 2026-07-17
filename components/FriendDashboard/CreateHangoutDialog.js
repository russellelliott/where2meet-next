import React, { useState } from 'react';
import dayjs from 'dayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  TextField,
  RadioGroup,
  FormControl,
  FormControlLabel,
  Radio,
  Checkbox,
  Divider,
  MenuItem,
  Select,
} from '@mui/material';

/**
 * CreateHangoutDialog - Create a new hangout at a selected POI
 * @param {object} props
 * @param {boolean} props.open - Whether dialog is open
 * @param {Function} props.onClose - Callback when closing
 * @param {Function} props.onCreateHangout - Callback to create hangout (hangoutData)
 * @param {string} props.poiId - The POI ID to create hangout at
 * @param {string|null} props.poiName - Name of the POI (optional)
 * @param {Array} props.friends - Array of friend objects
 * @param {Array} props.groups - Array of group objects
 */
export default function CreateHangoutDialog({
  open,
  onClose,
  onCreateHangout,
  poiId,
  poiName = null,
  friends = [],
  groups = [],
}) {
  const [hangoutType, setHangoutType] = useState('physical');
  const [datetime, setDatetime] = useState(dayjs());
  const [description, setDescription] = useState('');
  const [selectedFriendIds, setSelectedFriendIds] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');

  if (!open) return null;

  const handleCreate = () => {
    if (!poiId) return;
    if (selectedFriendIds.length === 0 && !selectedGroupId) {
      alert('Please select at least one friend or a group.');
      return;
    }

    const hangoutData = {
      poiId,
      type: hangoutType,
      datetime: datetime?.toISOString() || new Date().toISOString(),
      description: description.trim() || undefined,
      friendIds: selectedFriendIds.length > 0 ? selectedFriendIds : undefined,
      groupId: selectedGroupId || undefined,
    };

    onCreateHangout(hangoutData);
    handleClose();
  };

  const handleClose = () => {
    setSelectedFriendIds([]);
    setSelectedGroupId('');
    setDescription('');
    setDatetime(dayjs());
    onClose();
  };

  const toggleFriend = (friendId) => {
    if (selectedFriendIds.includes(friendId)) {
      setSelectedFriendIds(selectedFriendIds.filter((id) => id !== friendId));
    } else {
      setSelectedFriendIds([...selectedFriendIds, friendId]);
    }
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 2 } }}>
        <DialogTitle>Create Hangout</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>

            {/* Location Display */}
            <Box>
              <Typography variant="subtitle2" gutterBottom>Location</Typography>
              <Typography variant="body2" color="text.primary">
                {poiName || poiId}
              </Typography>
            </Box>

            {/* Hangout Type */}
            <FormControl componentLegend="Hangout Type">
              <RadioGroup
                value={hangoutType}
                onChange={(e) => setHangoutType(e.target.value)}
              >
                <FormControlLabel value="physical" control={<Radio />} label="Physical" />
                <FormControlLabel value="virtual" control={<Radio />} label="Virtual" />
              </RadioGroup>
            </FormControl>

            {/* Date/Time */}
            <DateTimePicker
              label="Hangout Date & Time"
              value={datetime}
              onChange={(newValue) => setDatetime(newValue)}
              renderInput={(params) => <TextField {...params} fullWidth size="small" />}
            />

            {/* Description */}
            <TextField
              fullWidth
              label="Description"
              placeholder="e.g., Video call, Beach day planning"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              size="small"
            />

            <Divider />

            {/* Friends Selection (Multi-select checkboxes) */}
            <Box>
              <Typography variant="subtitle2" gutterBottom>Friends</Typography>
              <Box sx={{ border: '1px solid #e0e0e0', borderRadius: 1, maxHeight: 150, overflowY: 'auto', p: 1 }}>
                {friends.length === 0 && (
                  <Typography variant="caption" color="text.secondary">No friends available.</Typography>
                )}
                {friends.map((friend) => (
                  <Box key={friend.id} sx={{ display: 'flex', alignItems: 'center', py: 0.5 }}>
                    <Checkbox
                      checked={selectedFriendIds.includes(friend.id)}
                      onChange={() => toggleFriend(friend.id)}
                      size="small"
                    />
                    <Typography variant="body2">{friend.name}</Typography>
                  </Box>
                ))}
              </Box>
            </Box>

            {/* Group Selection (Single-select radio) */}
            <Box>
              <Typography variant="subtitle2" gutterBottom>Group</Typography>
              <FormControl fullWidth size="small">
                <Select
                  value={selectedGroupId}
                  onChange={(e) => setSelectedGroupId(e.target.value)}
                >
                  {groups.length === 0 && (
                    <MenuItem value="">No groups available</MenuItem>
                  )}
                  {groups.map((group) => (
                    <MenuItem key={group.id} value={group.id}>
                      {group.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>

          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button onClick={handleClose}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={!poiId}>
            Create Hangout
          </Button>
        </DialogActions>
      </Dialog>
    </LocalizationProvider>
  );
}