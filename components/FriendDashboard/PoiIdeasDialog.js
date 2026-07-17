import React, { useState } from 'react';
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
  ListItemText,
  Divider,
} from '@mui/material';

/**
 * PoiIdeasDialog - Add/remove POI to friend/group placeIdeas
 * @param {object} props
 * @param {boolean} props.open - Whether dialog is open
 * @param {Function} props.onClose - Callback when closing
 * @param {Array} props.friends - Array of friend objects
 * @param {Array} props.groups - Array of group objects
 * @param {string|null} props.selectedPoiId - Selected POI ID
 * @param {Function} props.onTogglePlaceIdea - Callback to add/remove place idea (friendId, poiId) or (groupId, poiId)
 */
export default function PoiIdeasDialog({
  open,
  onClose,
  friends,
  groups,
  selectedPoiId,
  onTogglePlaceIdea,
}) {
  if (!open || !selectedPoiId) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 2 } }}>
      <DialogTitle>Add to Place Ideas</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', gap: 3, mt: 1 }}>
          {/* Left Column: Friends */}
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle2" gutterBottom>
              Friends
            </Typography>
            <List dense sx={{ maxHeight: 200, overflowY: 'auto' }}>
              {friends.map((friend) => {
                const isChecked = friend.planning?.placeIdeas?.includes(selectedPoiId);
                return (
                  <ListItem key={friend.id}>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={!!isChecked}
                          onChange={() => onTogglePlaceIdea(friend.id, null, selectedPoiId)}
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
            <Typography variant="subtitle2" gutterBottom>
              Groups
            </Typography>
            <List dense sx={{ maxHeight: 200, overflowY: 'auto' }}>
              {groups.map((group) => {
                const isChecked = group.planning?.placeIdeas?.includes(selectedPoiId);
                return (
                  <ListItem key={group.id}>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={!!isChecked}
                          onChange={() => onTogglePlaceIdea(null, group.id, selectedPoiId)}
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