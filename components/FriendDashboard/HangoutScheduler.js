import React, { useState } from 'react';
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
} from 'lucide-react';

/**
 * HangoutScheduler Component
 * Schedule and manage hangouts, create groups, view history
 * @param {object} props
 * @param {Array} props.friends - Array of friend objects
 * @param {Array} props.groups - Array of group objects
 * @param {Array} props.plannedHangouts - Array of planned hangout objects
 * @param {Array} props.history - Array of completed hangout history items
 * @param {Function} props.onAddPlannedHangout - Callback to add a planned hangout
 * @param {Function} props.onCompletePlannedHangout - Callback to complete a planned hangout
 * @param {Function} props.onAddGroup - Callback to add a group
 * @param {Function} props.onDeletePlannedHangout - Callback to delete a planned hangout
 * @param {Function} props.onTriggerNotification - Callback to trigger a notification
 */
export default function HangoutScheduler({
  friends,
  groups,
  plannedHangouts,
  history,
  onAddPlannedHangout,
  onCompletePlannedHangout,
  onAddGroup,
  onDeletePlannedHangout,
  onTriggerNotification,
}) {
  const [isScheduling, setIsScheduling] = useState(false);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);

  // Form states for scheduling
  const [hangoutTitle, setHangoutTitle] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [hangoutType, setHangoutType] = useState('physical');
  const [datetime, setDatetime] = useState('2026-07-15T18:00');
  const [location, setLocation] = useState('');
  const [details, setDetails] = useState('');
  // Custom attendee list initialized based on selected group, but customizable
  const [customAttendeeIds, setCustomAttendeeIds] = useState([]);

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

  // Helper to handle group selection change in scheduler form
  const handleGroupChange = (groupId) => {
    setSelectedGroupId(groupId);
    const group = groups.find((g) => g.id === groupId);
    if (group) {
      setCustomAttendeeIds(group.memberIds);
    } else {
      setCustomAttendeeIds([]);
    }
  };

  // Toggle custom attendee selection
  const toggleAttendee = (friendId) => {
    if (customAttendeeIds.includes(friendId)) {
      setCustomAttendeeIds(customAttendeeIds.filter((id) => id !== friendId));
    } else {
      setCustomAttendeeIds([...customAttendeeIds, friendId]);
    }
  };

  // Handle schedule submission
  const handleScheduleSubmit = (e) => {
    e.preventDefault();
    if (!hangoutTitle.trim() || customAttendeeIds.length === 0) {
      onTriggerNotification('Please provide a title and select at least one attendee.');
      return;
    }

    const newPlannedHangout = {
      id: `plan_${Date.now()}`,
      title: hangoutTitle.trim(),
      groupId: selectedGroupId || 'custom_event',
      type: hangoutType,
      datetime: new Date(datetime).toISOString(),
      location: location.trim() || undefined,
      details: details.trim() || undefined,
    };

    onAddPlannedHangout(newPlannedHangout);

    // Reset scheduler state
    setHangoutTitle('');
    setSelectedGroupId('');
    setCustomAttendeeIds([]);
    setLocation('');
    setDetails('');
    setIsScheduling(false);
    onTriggerNotification(`Scheduled upcoming hangout "${newPlannedHangout.title}"!`);
  };

  // Handle group creation submission
  const handleGroupSubmit = (e) => {
    e.preventDefault();
    if (!groupName.trim() || groupMemberIds.length === 0) {
      onTriggerNotification('Please provide a group name and select at least one member.');
      return;
    }

    const newGroup = {
      id: `group_${Date.now()}`,
      name: groupName.trim(),
      memberIds: groupMemberIds,
      notes: groupNotes.trim() || undefined,
    };

    onAddGroup(newGroup);

    // Reset group form state
    setGroupName('');
    setGroupNotes('');
    setGroupMemberIds([]);
    setIsCreatingGroup(false);
    onTriggerNotification(`Created new group "${newGroup.name}"!`);
  };

  const toggleGroupMember = (friendId) => {
    if (groupMemberIds.includes(friendId)) {
      setGroupMemberIds(groupMemberIds.filter((id) => id !== friendId));
    } else {
      setGroupMemberIds([...groupMemberIds, friendId]);
    }
  };

  // Handle complete hangout leap simulation
  const handleCompleteLeap = (hangout) => {
    // Find attendees. If it is a standard group, we default to group members.
    const groupObj = groups.find((g) => g.id === hangout.groupId);
    const attendees = groupObj ? groupObj.memberIds : friends.map((f) => f.id);

    onCompletePlannedHangout(hangout.id, hangout.datetime, attendees);

    const namesList = attendees
      .map((id) => friends.find((f) => f.id === id)?.name)
      .filter(Boolean)
      .join(', ');

    onTriggerNotification(`🎉 Simulated leap! "${hangout.title}" completed. Updated contact records for: ${namesList}.`);
  };

   // Scheduling form - wrapped in Dialog
  const SchedulingFormDialog = () => (
<Dialog
open={isScheduling}
onClose={() => setIsScheduling(false)}
maxWidth="md"
 fullWidth
 PaperProps={{ sx: { borderRadius: 3, backgroundColor: '#FBFBF9' } }}
>
 <DialogTitle sx={{ pb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
   <Calendar size={18} color="#CC7A5C" />
   Schedule Group Hangout
 </DialogTitle>

 <DialogContent dividers>
   <form onSubmit={handleScheduleSubmit}>
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
          required
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
           {/* Type toggle */}
           <Box>
             <Typography variant="caption" sx={{ display: 'block', fontFamily: 'monospace', fontSize: '9px', textTransform: 'uppercase', fontWeight: 700, color: '#7D7B6D', mb: 0.5 }}>
              Type
             </Typography>
             <Box sx={{ display: 'flex', borderRadius: 2, border: '1px solid #E0DED7', overflow: 'hidden', p: 0.25 }}>
               {['physical', 'virtual'].map((type) => (
                 <button
                  key={type}
                  type="button"
                  onClick={() => setHangoutType(type)}
                  sx={{
                    flex: 1,
                    textTransform: 'none',
                    py: 0.75,
                    fontSize: '11px',
                    fontWeight: 600,
                    fontFamily: 'monospace',
                    borderRadius: 1,
                    backgroundColor: hangoutType === type ? '#5A5A40' : 'transparent',
                    color: hangoutType === type ? '#FFFFFF' : '#7D7B6D',
                    transition: 'all 0.2s ease',
                   }}
                 >
                   {type === 'physical' ? 'Physical' : 'Virtual'}
                 </button>
               ))}
             </Box>
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

         <TextField
          fullWidth
          size="small"
          label={hangoutType === 'physical' ? 'Physical Destination POI / City' : 'Virtual Connection Link / Channel'}
          placeholder={hangoutType === 'physical' ? 'Henry Cowell Park / Santa Cruz' : 'Discord Voice Channel'}
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
         />

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
               <label key={f.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.75, px: 1, borderRadius: 1, cursor: 'pointer', '&:hover': { backgroundColor: '#FBFBF9' } }}>
                 <input type="checkbox" checked={isChecked} onChange={() => toggleAttendee(f.id)} style={{ accentColor: '#CC7A5C' }} />
                 <Typography variant="body2" sx={{ fontSize: '12px', flex: 1 }}>{f.name}</Typography>
                 <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: '9px', color: '#7D7B6D' }}>
                   ({f.location?.city || 'Unknown'})
                 </Typography>
               </label>
             );
           })}
         </Paper>
         <Typography variant="caption" sx={{ display: 'block', fontStyle: 'italic', color: '#7D7B6D', mt: 1, fontSize: '10px' }}>
          Add or remove specific individuals for this hangout commitment.
         </Typography>
       </Box>
     </Box>

     <Divider sx={{ my: 2 }} />

     <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
       <Button onClick={() => setIsScheduling(false)} variant="text" size="small" sx={{ textTransform: 'none', color: '#7D7B6D' }}>
        Cancel
       </Button>
       <Button type="submit" variant="contained" size="small" sx={{ backgroundColor: '#5A5A40', textTransform: 'none', '&:hover': { backgroundColor: '#434330' } }}>
        Schedule Sync
       </Button>
     </Box>
   </form>
 </DialogContent>

 <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
   <Button onClick={() => setIsScheduling(false)}>Cancel</Button>
   <Button type="submit" variant="contained" sx={{ backgroundColor: '#5A5A40', '&:hover': { backgroundColor: '#434330' } }}>
    Schedule Sync
   </Button>
 </DialogActions>
</Dialog>
);

    // Group creation form - wrapped in Dialog
  const GroupCreationForm = () => (
<Dialog
open={isCreatingGroup}
onClose={() => setIsCreatingGroup(false)}
maxWidth="md"
 fullWidth
 PaperProps={{ sx: { borderRadius: 3, backgroundColor: '#FBFBF9' } }}
>
 <DialogTitle sx={{ pb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
    <Users size={18} color="#CC7A5C" />
   Create New Friend Group
 </DialogTitle>

 <DialogContent dividers>
    <form onSubmit={handleGroupSubmit}>
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
                <label key={f.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.75, px: 1, borderRadius: 1, cursor: 'pointer', '&:hover': { backgroundColor: '#FBFBF9' } }}>
                  <input type="checkbox" checked={isChecked} onChange={() => toggleGroupMember(f.id)} style={{ accentColor: '#CC7A5C' }} />
                  <Typography variant="body2" sx={{ fontSize: '12px', flex: 1 }}>{f.name}</Typography>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: '9px', color: '#7D7B6D' }}>
                    ({f.location?.city || 'Unknown'})
                  </Typography>
                </label>
              );
            })}
          </Paper>
          <Typography variant="caption" sx={{ display: 'block', fontStyle: 'italic', color: '#7D7B6D', mt: 1, fontSize: '10px' }}>
           Select friends to include in this custom preset group.
          </Typography>
        </Box>
      </Box>

       <Divider sx={{ my: 2 }} />

       <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
         <Button onClick={() => setIsCreatingGroup(false)} variant="text" size="small" sx={{ textTransform: 'none', color: '#7D7B6D' }}>
          Cancel
         </Button>
         <Button type="submit" variant="contained" size="small" sx={{ backgroundColor: '#5A5A40', textTransform: 'none', '&:hover': { backgroundColor: '#434330' } }}>
          Save Group
         </Button>
       </Box>
    </form>
 </DialogContent>

 <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
    <Button onClick={() => setIsCreatingGroup(false)}>Cancel</Button>
    <Button type="submit" variant="contained" sx={{ backgroundColor: '#5A5A40', '&:hover': { backgroundColor: '#434330' } }}>
     Save Group
    </Button>
 </DialogActions>
</Dialog>
);

  return (
    <Box>
       {/* Plan Event / Create Group dialogs render at top level */}
       {<SchedulingFormDialog />}
       {<GroupCreationForm />}

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
            <Button
              onClick={() => { setIsScheduling(true); setIsCreatingGroup(false); }}
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
              onClick={() => { setIsCreatingGroup(true); setIsScheduling(false); }}
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
            {groups.map((group) => {
              const memberNames = group.memberIds
                .map((id) => friends.find((f) => f.id === id)?.name?.split(' ')[0])
                .filter(Boolean)
                .join(', ');

              return (
                <Paper key={group.id} variant="outlined" sx={{ p: 2, borderRadius: 2, backgroundColor: '#FBFBF9' }}>
                  <Typography variant="subtitle2" sx={{ fontFamily: 'serif', fontWeight: 700, fontSize: '0.85rem', color: '#2D2D20' }}>
                    {group.name}
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#7D7B6D', display: 'block', mt: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {group.notes || 'No group notes'}
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
                      {hangout.location && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.75 }}>
                          <MapPin size={14} color="#9B988C" />
                          <Typography variant="body2" sx={{ fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {hangout.location}
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
                No active planned events. Click 'Plan Event' to schedule.
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