/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Friend, Group, HangoutHistoryItem, PlannedHangout } from '../types';
import { Calendar, Users, Clock, Plus, Flame, CheckCircle, Video, MapPin, X, ArrowRight, ClipboardList } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface HangoutSchedulerProps {
  friends: Friend[];
  groups: Group[];
  plannedHangouts: PlannedHangout[];
  history: HangoutHistoryItem[];
  onAddPlannedHangout: (hangout: PlannedHangout) => void;
  onCompletePlannedHangout: (hangoutId: string, actualDate: string, attendeeIds: string[]) => void;
  onAddGroup: (group: Group) => void;
  onDeletePlannedHangout: (id: string) => void;
  onTriggerNotification: (message: string) => void;
}

export default function HangoutScheduler({
  friends,
  groups,
  plannedHangouts,
  history,
  onAddPlannedHangout,
  onCompletePlannedHangout,
  onAddGroup,
  onDeletePlannedHangout,
  onTriggerNotification
}: HangoutSchedulerProps) {
  const [isScheduling, setIsScheduling] = useState(false);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);

  // Form states for scheduling
  const [hangoutTitle, setHangoutTitle] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [hangoutType, setHangoutType] = useState<'physical' | 'virtual'>('physical');
  const [datetime, setDatetime] = useState('2026-07-15T18:00');
  const [location, setLocation] = useState('');
  const [details, setDetails] = useState('');
  // Custom attendee list initialized based on selected group, but customizable
  const [customAttendeeIds, setCustomAttendeeIds] = useState<string[]>([]);

  // Form states for creating a group
  const [groupName, setGroupName] = useState('');
  const [groupNotes, setGroupNotes] = useState('');
  const [groupMemberIds, setGroupMemberIds] = useState<string[]>([]);

  // Format date nicely
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Helper to handle group selection change in scheduler form
  const handleGroupChange = (groupId: string) => {
    setSelectedGroupId(groupId);
    const group = groups.find(g => g.id === groupId);
    if (group) {
      setCustomAttendeeIds(group.memberIds);
    } else {
      setCustomAttendeeIds([]);
    }
  };

  // Toggle custom attendee selection
  const toggleAttendee = (friendId: string) => {
    if (customAttendeeIds.includes(friendId)) {
      setCustomAttendeeIds(customAttendeeIds.filter(id => id !== friendId));
    } else {
      setCustomAttendeeIds([...customAttendeeIds, friendId]);
    }
  };

  // Handle schedule submission
  const handleScheduleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hangoutTitle.trim() || customAttendeeIds.length === 0) {
      onTriggerNotification('Please provide a title and select at least one attendee.');
      return;
    }

    const newPlannedHangout: PlannedHangout = {
      id: `plan_${Date.now()}`,
      title: hangoutTitle.trim(),
      groupId: selectedGroupId || 'custom_event',
      type: hangoutType,
      datetime: new Date(datetime).toISOString(),
      location: location.trim() || undefined,
      details: details.trim() || undefined
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
  const handleGroupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim() || groupMemberIds.length === 0) {
      onTriggerNotification('Please provide a group name and select at least one member.');
      return;
    }

    const newGroup: Group = {
      id: `group_${Date.now()}`,
      name: groupName.trim(),
      memberIds: groupMemberIds,
      notes: groupNotes.trim() || undefined
    };

    onAddGroup(newGroup);

    // Reset group form state
    setGroupName('');
    setGroupNotes('');
    setGroupMemberIds([]);
    setIsCreatingGroup(false);
    onTriggerNotification(`Created new group "${newGroup.name}"!`);
  };

  const toggleGroupMember = (friendId: string) => {
    if (groupMemberIds.includes(friendId)) {
      setGroupMemberIds(groupMemberIds.filter(id => id !== friendId));
    } else {
      setGroupMemberIds([...groupMemberIds, friendId]);
    }
  };

  // Handle complete hangout leap simulation
  const handleCompleteLeap = (hangout: PlannedHangout) => {
    // Find attendees. If it is a standard group, we default to group members.
    // If it has a custom attendee selection in state (just in case), we use it.
    const groupObj = groups.find(g => g.id === hangout.groupId);
    const attendees = groupObj ? groupObj.memberIds : friends.map(f => f.id);
    
    onCompletePlannedHangout(hangout.id, hangout.datetime, attendees);
    
    const namesList = attendees
      .map(id => friends.find(f => f.id === id)?.name)
      .filter(Boolean)
      .join(', ');

    onTriggerNotification(`🎉 Simulated leap! "${hangout.title}" completed. Updated contact records for: ${namesList}.`);
  };

  return (
    <div className="space-y-6">
      
      {/* Dynamic Scheduling Forms container */}
      <AnimatePresence mode="wait">
        {isScheduling && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-[#FBFBF9] border border-[#EBE9E2] rounded-2xl p-5 shadow-xs"
          >
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#EBE9E2]">
              <div className="flex items-center space-x-2 text-[#2D2D20]">
                <Calendar className="w-4 h-4 text-[#CC7A5C]" />
                <h4 className="font-serif font-bold text-sm">Schedule Group Hangout</h4>
              </div>
              <button 
                onClick={() => setIsScheduling(false)}
                className="text-[#9B988C] hover:text-[#2D2D20]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleScheduleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] text-[#7D7B6D] font-mono uppercase tracking-wider block mb-1">Hangout Title</label>
                    <input
                      type="text"
                      required
                      placeholder="E.g. Sunday Board Game Run"
                      value={hangoutTitle}
                      onChange={e => setHangoutTitle(e.target.value)}
                      className="w-full bg-white border border-[#E0DED7] rounded-xl px-3 py-1.5 text-xs text-[#3D3D3D] focus:border-[#CC7A5C] outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-[#7D7B6D] font-mono uppercase tracking-wider block mb-1">Pre-set Group</label>
                    <select
                      value={selectedGroupId}
                      onChange={e => handleGroupChange(e.target.value)}
                      className="w-full bg-white border border-[#E0DED7] rounded-xl px-3 py-1.5 text-xs text-[#3D3D3D] focus:border-[#CC7A5C] outline-none"
                    >
                      <option value="">-- Custom (Select Friends Below) --</option>
                      {groups.map(g => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-[#7D7B6D] font-mono uppercase tracking-wider block mb-1">Type</label>
                      <div className="flex rounded-lg bg-white border border-[#E0DED7] p-0.5">
                        <button
                          type="button"
                          onClick={() => setHangoutType('physical')}
                          className={`flex-1 text-center py-1 text-xs font-semibold rounded-md transition ${hangoutType === 'physical' ? 'bg-[#5A5A40] text-white' : 'text-[#7D7B6D]'}`}
                        >
                          Physical
                        </button>
                        <button
                          type="button"
                          onClick={() => setHangoutType('virtual')}
                          className={`flex-1 text-center py-1 text-xs font-semibold rounded-md transition ${hangoutType === 'virtual' ? 'bg-[#5A5A40] text-white' : 'text-[#7D7B6D]'}`}
                        >
                          Virtual
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] text-[#7D7B6D] font-mono uppercase tracking-wider block mb-1">Date & Time</label>
                      <input
                        type="datetime-local"
                        value={datetime}
                        onChange={e => setDatetime(e.target.value)}
                        className="w-full bg-white border border-[#E0DED7] rounded-xl px-2 py-1 text-xs text-[#3D3D3D]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] text-[#7D7B6D] font-mono uppercase tracking-wider block mb-1">
                      {hangoutType === 'physical' ? 'Physical Destination POI / City' : 'Virtual Connection Link / Channel'}
                    </label>
                    <input
                      type="text"
                      placeholder={hangoutType === 'physical' ? 'Henry Cowell Park / Santa Cruz' : 'Discord Voice Channel'}
                      value={location}
                      onChange={e => setLocation(e.target.value)}
                      className="w-full bg-white border border-[#E0DED7] rounded-xl px-3 py-1.5 text-xs text-[#3D3D3D] focus:border-[#CC7A5C] outline-none"
                    />
                  </div>
                </div>

                {/* Right col: customizable attendees */}
                <div>
                  <label className="text-[10px] text-[#7D7B6D] font-mono uppercase tracking-wider block mb-1">
                    Attendees (Customize Selection)
                  </label>
                  <div className="border border-[#E0DED7] rounded-xl bg-white p-2 h-[180px] overflow-y-auto space-y-1.5">
                    {friends.map(f => {
                      const isChecked = customAttendeeIds.includes(f.id);
                      return (
                        <label key={f.id} className="flex items-center space-x-2 text-xs text-[#3D3D3D] hover:bg-[#FBFBF9] p-1 rounded cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleAttendee(f.id)}
                            className="rounded border-[#E0DED7] text-[#CC7A5C]"
                          />
                          <span>{f.name}</span>
                          <span className="text-[9px] text-[#7D7B6D] font-mono">({f.location.city})</span>
                        </label>
                      );
                    })}
                  </div>
                  <p className="text-[9px] text-[#7D7B6D] mt-1 italic">
                    Add or remove specific individuals for this hangout commitment.
                  </p>
                </div>
              </div>

              <div>
                <label className="text-[10px] text-[#7D7B6D] font-mono uppercase tracking-wider block mb-1">Planning Notes / Logistics details</label>
                <textarea
                  rows={2}
                  placeholder="Need food recommendations, ride-share configurations..."
                  value={details}
                  onChange={e => setDetails(e.target.value)}
                  className="w-full bg-white border border-[#E0DED7] rounded-xl px-3 py-1.5 text-xs text-[#3D3D3D] focus:border-[#CC7A5C] outline-none"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-[#EBE9E2]">
                <button
                  type="button"
                  onClick={() => setIsScheduling(false)}
                  className="px-3 py-1.5 text-xs text-[#7D7B6D] hover:text-[#2D2D20]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#CC7A5C] hover:bg-[#b86649] text-white text-xs font-bold rounded-xl shadow-xs"
                >
                  Schedule Sync
                </button>
              </div>
            </form>
          </motion.div>
        )}

        {isCreatingGroup && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-[#FBFBF9] border border-[#EBE9E2] rounded-2xl p-5 shadow-xs"
          >
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#EBE9E2]">
              <div className="flex items-center space-x-2 text-[#2D2D20]">
                <Users className="w-4 h-4 text-[#CC7A5C]" />
                <h4 className="font-serif font-bold text-sm">Create New Friend Group</h4>
              </div>
              <button 
                onClick={() => setIsCreatingGroup(false)}
                className="text-[#9B988C] hover:text-[#2D2D20]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleGroupSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] text-[#7D7B6D] font-mono uppercase tracking-wider block mb-1">Group Name</label>
                    <input
                      type="text"
                      required
                      placeholder="E.g. Beach Volleyball Crew"
                      value={groupName}
                      onChange={e => setGroupName(e.target.value)}
                      className="w-full bg-white border border-[#E0DED7] rounded-xl px-3 py-1.5 text-xs text-[#3D3D3D] focus:border-[#CC7A5C] outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-[#7D7B6D] font-mono uppercase tracking-wider block mb-1">Group Notes / Core Focus</label>
                    <textarea
                      rows={4}
                      placeholder="E.g. Best friends from high school or local surf buddies..."
                      value={groupNotes}
                      onChange={e => setGroupNotes(e.target.value)}
                      className="w-full bg-white border border-[#E0DED7] rounded-xl px-3 py-1.5 text-xs text-[#3D3D3D] focus:border-[#CC7A5C] outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-[#7D7B6D] font-mono uppercase tracking-wider block mb-1">Group Members</label>
                  <div className="border border-[#E0DED7] rounded-xl bg-white p-2 h-[180px] overflow-y-auto space-y-1.5">
                    {friends.map(f => {
                      const isChecked = groupMemberIds.includes(f.id);
                      return (
                        <label key={f.id} className="flex items-center space-x-2 text-xs text-[#3D3D3D] hover:bg-[#FBFBF9] p-1 rounded cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleGroupMember(f.id)}
                            className="rounded border-[#E0DED7] text-[#CC7A5C]"
                          />
                          <span>{f.name}</span>
                          <span className="text-[9px] text-[#7D7B6D] font-mono">({f.location.city})</span>
                        </label>
                      );
                    })}
                  </div>
                  <p className="text-[9px] text-[#7D7B6D] mt-1 italic">
                    Select friends to include in this custom preset group.
                  </p>
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-[#EBE9E2]">
                <button
                  type="button"
                  onClick={() => setIsCreatingGroup(false)}
                  className="px-3 py-1.5 text-xs text-[#7D7B6D] hover:text-[#2D2D20]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#CC7A5C] hover:bg-[#b86649] text-white text-xs font-bold rounded-xl shadow-xs"
                >
                  Save Group
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Roster & Scheduled Hangouts Hub */}
      <div className="bg-white border border-[#EBE9E2] rounded-[24px] p-5 flex flex-col space-y-4 shadow-xs">
        
        <div className="flex items-center justify-between pb-2 border-b border-[#F2F0EA]">
          <div className="flex items-center space-x-2">
            <Clock className="w-4.5 h-4.5 text-[#CC7A5C]" />
            <h3 className="font-serif font-bold text-[#2D2D20] text-sm">Commitments & Planning</h3>
          </div>

          <div className="flex items-center space-x-1.5">
            <button
              onClick={() => {
                setIsScheduling(true);
                setIsCreatingGroup(false);
              }}
              className="bg-[#5A5A40]/10 text-[#5A5A40] hover:bg-[#5A5A40]/20 font-bold text-[11px] px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
            >
              + Plan Event
            </button>
            <button
              onClick={() => {
                setIsCreatingGroup(true);
                setIsScheduling(false);
              }}
              className="bg-[#CC7A5C]/10 text-[#CC7A5C] hover:bg-[#CC7A5C]/20 font-bold text-[11px] px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
            >
              + Create Group
            </button>
          </div>
        </div>

        {/* Groups Quick Overview */}
        <div>
          <span className="text-[10px] text-[#7D7B6D] uppercase font-mono font-bold tracking-wider block mb-2">Preset Friend Groups</span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {groups.map(group => {
              const memberNames = group.memberIds
                .map(id => friends.find(f => f.id === id)?.name.split(' ')[0])
                .filter(Boolean)
                .join(', ');

              return (
                <div key={group.id} className="bg-[#FBFBF9] border border-[#EBE9E2] rounded-xl p-3 flex flex-col justify-between">
                  <div>
                    <h5 className="font-bold text-xs text-[#2D2D20]">{group.name}</h5>
                    <p className="text-[10px] text-[#7D7B6D] line-clamp-1 mt-0.5">{group.notes || 'No group notes'}</p>
                  </div>
                  <div className="mt-2 text-[10px] text-[#5A5A40] font-medium font-serif bg-[#F0EEE6] px-2 py-0.5 rounded-md w-fit">
                    Members: {memberNames || 'None'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Pending Commitments & Time Leap Simulation */}
        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#7D7B6D] uppercase font-mono font-bold tracking-wider">Pending Commitments</span>
            <span className="text-[9px] text-[#CC7A5C] font-semibold italic">Time-Leap simulates event completion</span>
          </div>

          <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
            {plannedHangouts.length > 0 ? (
              plannedHangouts.map(hangout => {
                const groupObj = groups.find(g => g.id === hangout.groupId);
                const attendees = groupObj ? groupObj.memberIds : [];
                const attendeeNames = attendees
                  .map(id => friends.find(f => f.id === id)?.name.split(' ')[0])
                  .filter(Boolean)
                  .join(', ');

                return (
                  <div key={hangout.id} className="bg-white border border-[#EBE9E2] rounded-xl p-3 shadow-2xs space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-[9px] uppercase font-mono text-[#7D7B6D] block">
                          {groupObj ? groupObj.name : 'Custom Event'}
                        </span>
                        <h4 className="font-bold text-xs text-[#2D2D20]">{hangout.title}</h4>
                      </div>
                      
                      {hangout.type === 'physical' ? (
                        <span className="text-[9px] bg-[#25D366]/10 text-[#1e8544] px-1.5 py-0.5 rounded font-mono font-bold border border-[#25D366]/20">PHYSICAL</span>
                      ) : (
                        <span className="text-[9px] bg-[#5865F2]/10 text-[#5865F2] px-1.5 py-0.5 rounded font-mono font-bold border border-[#5865F2]/20">VIRTUAL</span>
                      )}
                    </div>

                    <div className="text-[11px] text-[#7D7B6D] space-y-1">
                      {hangout.location && (
                        <div className="flex items-center space-x-1">
                          <MapPin className="w-3.5 h-3.5 text-[#9B988C]" />
                          <span className="truncate">{hangout.location}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between border-t border-[#F2F0EA] pt-2 mt-1">
                        <span className="font-mono text-[10px]">{formatDate(hangout.datetime)}</span>
                        <div className="flex space-x-1.5">
                          <button
                            onClick={() => handleCompleteLeap(hangout)}
                            className="bg-[#5A5A40] hover:bg-[#434330] text-white font-mono font-bold text-[9px] px-2 py-1 rounded transition-all flex items-center space-x-1 shadow-2xs"
                            title="Leap time forward to simulate completing this event"
                          >
                            <Flame className="w-3 h-3 text-[#FFDD6B] animate-pulse" />
                            <span>Leap Complete</span>
                          </button>
                          <button
                            onClick={() => onDeletePlannedHangout(hangout.id)}
                            className="text-[#9B988C] hover:text-[#CC7A5C] p-1 rounded hover:bg-[#F9F8F6]"
                            title="Cancel Commitment"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                    {attendeeNames && (
                      <div className="text-[9px] text-[#7D7B6D] bg-[#FBFBF9] p-1 px-2 rounded border border-[#EBE9E2] truncate">
                        Attendees: <span className="font-medium text-[#2D2D20]">{attendeeNames}</span>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="text-center py-6 text-[#9B988C] text-xs italic bg-[#FBFBF9] border border-dashed border-[#E0DED7] rounded-xl">
                No active planned events. Click 'Plan Event' to schedule.
              </div>
            )}
          </div>
        </div>

        {/* Historical Logs strip */}
        <div className="pt-2">
          <div className="flex items-center space-x-1 mb-2">
            <ClipboardList className="w-3.5 h-3.5 text-[#7D7B6D]" />
            <span className="text-[10px] text-[#7D7B6D] uppercase font-mono font-bold tracking-wider">Past Completed Logs ({history.length})</span>
          </div>
          
          <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1">
            {history.map((h, idx) => {
              const attendeeNames = h.friendIds
                .map(fId => friends.find(f => f.id === fId)?.name.split(' ')[0])
                .filter(Boolean)
                .join(', ');

              return (
                <div key={h.id || idx} className="text-xs border-b border-[#F2F0EA] pb-2 last:border-b-0 last:pb-0">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-[#9B988C] font-mono">{formatDate(h.datetime)}</span>
                    <span className="text-[#5A5A40] font-mono truncate max-w-[150px]">
                      {attendeeNames || 'No attendees'}
                    </span>
                  </div>
                  <strong className="text-[#2D2D20] block text-[11px] mt-0.5">{h.title}</strong>
                  {h.details && <p className="text-[10px] text-[#7D7B6D] leading-relaxed italic">{h.details}</p>}
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
