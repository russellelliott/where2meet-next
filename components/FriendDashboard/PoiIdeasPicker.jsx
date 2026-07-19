import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Checkbox,
  FormControlLabel,
  List,
  ListItem,
  Divider,
} from '@mui/material';

/**
 * PoiIdeasPicker — Shared dialog for adding/removing POIs to friend/group placeIdeas.
 * Two-column layout: Friends (left) | Groups (right).
 * 
 * @param {object} props
 * @param {boolean} props.open - Whether dialog is open
 * @param {Function} props.onClose - Callback when closing
 * @param {Array} props.friends - Array of friend objects (each may have top-level placeIdeas[])
 * @param {Array} props.groups - Array of group objects (each may have top-level placeIdeas[])
 * @param {string} props.selectedPoiId - Selected POI ID to toggle
 * @param {string} [props.selectedPoiName] - Human-readable POI name for the title
 * @param {Function} props.onTogglePlaceIdea - Callback(onError, entityType, entityId, poiId) — "friend" or "group"
 */
export default function PoiIdeasPicker({
  open,
  onClose,
  friends = [],
  groups = [],
  selectedPoiId,
  selectedPoiName,
  onTogglePlaceIdea,
}) {
  if (!open || !selectedPoiId) return null;

  const handleToggleFriend = (friendId) => {
    if (onTogglePlaceIdea) {
      onTogglePlaceIdea(null, 'friend', friendId, selectedPoiId);
    }
  };

  const handleToggleGroup = (groupId) => {
    if (onTogglePlaceIdea) {
      onTogglePlaceIdea(null, 'group', groupId, selectedPoiId);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 2 } }}>
      <DialogTitle>Add "{selectedPoiName || selectedPoiId}" to Place Ideas</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', gap: 3, mt: 1 }}>
          {/* Left Column: Friends */}
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle2" gutterBottom fontWeight="bold">
              Friends
            </Typography>
            <Divider sx={{ mb: 1 }} />
            <List dense sx={{ maxHeight: 300, overflowY: 'auto' }}>
              {friends.map((friend) => {
                const isChecked = Array.isArray(friend.placeIdeas) && friend.placeIdeas.includes(selectedPoiId);
                return (
                  <ListItem key={friend.id}>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={!!isChecked}
                          onChange={() => handleToggleFriend(friend.id)}
                          size="small"
                        />
                      }
                      label={<Typography variant="body2">{friend.name}</Typography>}
                    />
                  </ListItem>
                );
              })}
              {friends.length === 0 && (
                <Typography variant="caption" color="text.secondary" sx={{ p: 1 }}>
                  No friends yet.
                </Typography>
              )}
            </List>
          </Box>

          {/* Right Column: Groups */}
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle2" gutterBottom fontWeight="bold">
              Groups
            </Typography>
            <Divider sx={{ mb: 1 }} />
            <List dense sx={{ maxHeight: 300, overflowY: 'auto' }}>
              {groups.map((group) => {
                const isChecked = Array.isArray(group.placeIdeas) && group.placeIdeas.includes(selectedPoiId);
                return (
                  <ListItem key={group.id}>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={!!isChecked}
                          onChange={() => handleToggleGroup(group.id)}
                          size="small"
                        />
                      }
                      label={
                        <Box>
                          <Typography variant="body2">{group.name}</Typography>
                          {group.memberIds && group.memberIds.length > 0 && (
                            <Typography variant="caption" color="text.secondary">
                              ({group.memberIds.length} members)
                            </Typography>
                          )}
                        </Box>
                      }
                    />
                  </ListItem>
                );
              })}
              {groups.length === 0 && (
                <Typography variant="caption" color="text.secondary" sx={{ p: 1 }}>
                  No groups yet.
                </Typography>
              )}
            </List>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}