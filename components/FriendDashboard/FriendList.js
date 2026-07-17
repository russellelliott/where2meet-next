import React, { useState } from 'react';
import { Search, MapPin, Tag, Car, AlertTriangle, Check, Trash2, Plus, UserX } from 'lucide-react';
import { FaPhone } from 'react-icons/fa6';
import { FaDiscord, FaInstagram } from 'react-icons/fa';
import { IoLogoWhatsapp } from 'react-icons/io';

/**
 * FriendList Component
 * Display and filter friends with search and filter options
 * @param {object} props
 * @param {Array} props.friends - Array of friend objects
 * @param {string} props.selectedFriendId - Currently selected friend ID
 * @param {Function} props.onSelectFriend - Callback when friend is selected
 * @param {Function} props.onRecordContact - Callback when marking contact
 * @param {Function} props.onDeleteFriend - Callback when deleting friend
 * @param {Function} props.onToggleAddForm - Toggle add form visibility
 * @param {boolean} props.isAddFormOpen - Whether add form is open
 */
export default function FriendList({
  friends,
  selectedFriendId,
  onSelectFriend,
  onRecordContact,
  onDeleteFriend,
  onToggleAddForm,
  isAddFormOpen,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCity, setSelectedCity] = useState('all');
  const [selectedStaleness, setSelectedStaleness] = useState('all');
  const [selectedLogistics, setSelectedLogistics] = useState('all');

  // Constant anchor time for relative calculations: July 12, 2026
  const CURRENT_TIME = new Date('2026-07-12T16:00:00Z');

  // Helper: calculate days since last contacted
  const getDaysSinceContact = (dateStr) => {
    if (!dateStr) return 999;
    const lastDate = new Date(dateStr);
    const diffTime = CURRENT_TIME.getTime() - lastDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return isNaN(diffDays) ? 0 : diffDays;
  };

  // Helper: Get Staleness Category based on the user's preference:
  // Green (< 7 days) -> fresh
  // Stale (8-30 days) -> stale
  // Overdue (> 30 days) -> overdue
  const getStalenessCategory = (days) => {
    if (days <= 7) return 'fresh';
    if (days <= 30) return 'stale';
    return 'overdue';
  };

  // Extract unique cities
  const cities = ['all', ...Array.from(new Set(friends.map((f) => f.location?.city || 'Unknown')))];

  // Filters
  const filteredFriends = friends.filter((friend) => {
    // Search filter (name or tags)
    const matchesSearch =
      friend.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      friend.tags?.some((t) => t.toLowerCase().includes(searchTerm.toLowerCase()));

    // City Hub filter
    const matchesCity = selectedCity === 'all' || friend.location?.city === selectedCity;

    // Staleness filter
    const days = getDaysSinceContact(friend.contact?.lastContactDate);
    const category = getStalenessCategory(days);
    const matchesStaleness = selectedStaleness === 'all' || category === selectedStaleness;

    // Logistics filter (Can drive / Needs ride / All)
    const matchesLogistics =
      selectedLogistics === 'all' ||
      (selectedLogistics === 'can_drive' && friend.logistics?.canDrive) ||
      (selectedLogistics === 'needs_ride' && friend.logistics?.pickupRequired);

    return matchesSearch && matchesCity && matchesStaleness && matchesLogistics;
  });

  // Render contact icons based on instructions for styling:
  // - Phone: Apple grey #666666
  // - Discord: Discord blue #5865F2
  // - WhatsApp: WhatsApp green #25D366
  // - Instagram: Instagram Purple #8a49a1
  const getContactIcon = (primary) => {
    switch (primary) {
      case 'discord':
        return (
          <div className="flex items-center space-x-1.5" title="Discord">
            <FaDiscord size={16} color="#5865F2" />
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#5865F2' }}>
              Discord
            </span>
          </div>
        );
      case 'whatsapp':
        return (
          <div className="flex items-center space-x-1.5" title="WhatsApp">
            <IoLogoWhatsapp size={16} color="#25D366" />
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#25D366' }}>
              WhatsApp
            </span>
          </div>
        );
      case 'instagram':
        return (
          <div className="flex items-center space-x-1.5" title="Instagram">
            <FaInstagram size={16} color="#8a49a1" />
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#8a49a1' }}>
              Instagram
            </span>
          </div>
        );
      default:
        return (
          <div className="flex items-center space-x-1.5" title="Phone">
            <FaPhone size={14} color="#666666" />
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#666666' }}>
              Phone
            </span>
          </div>
        );
    }
  };

  const getButtonStyles = (primary) => {
    switch (primary) {
      case 'discord':
        return {
          borderColor: '#5865F2',
          color: '#5865F2',
          hoverClass: 'hover:bg-[#5865F2] hover:text-white',
        };
      case 'whatsapp':
        return {
          borderColor: '#25D366',
          color: '#25D366',
          hoverClass: 'hover:bg-[#25D366] hover:text-white',
        };
      case 'instagram':
        return {
          borderColor: '#8a49a1',
          color: '#8a49a1',
          hoverClass: 'hover:bg-[#8a49a1] hover:text-white',
        };
      default:
        return {
          borderColor: '#666666',
          color: '#666666',
          hoverClass: 'hover:bg-[#666666] hover:text-white',
        };
    }
  };

  return (
    <div id="friend-list-card" className="bg-white border border-[#EBE9E2] rounded-[24px] p-5 flex flex-col h-full shadow-xs">
      {/* Search & Filters */}
      <div className="space-y-3 mb-5">
        <div className="flex items-center justify-between">
          <h3 className="font-serif font-bold text-[#2D2D20] text-base flex items-center space-x-2">
            <span>Friends Directory</span>
            <span className="bg-[#5A5A40]/10 text-[#5A5A40] text-[10px] px-2.5 py-0.5 rounded-full font-sans font-bold">
              {filteredFriends.length} listed
            </span>
          </h3>
          <button
            onClick={onToggleAddForm}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl flex items-center space-x-1 transition-all cursor-pointer shadow-xs ${
              isAddFormOpen ? 'bg-[#F0EEE6] text-[#2D2D20] hover:bg-[#E0DED7]' : 'bg-[#CC7A5C] hover:bg-[#b86649] text-white'
            }`}
            id="toggle-add-friend"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{isAddFormOpen ? 'Close Form' : 'Add Friend'}</span>
          </button>
        </div>

        {/* Searching bar */}
        <div className="relative">
          <Search className="w-4 h-4 text-[#9B988C] absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Search by name or tag (e.g. 'Hiking')..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#FBFBF9] border border-[#EBE9E2] rounded-xl pl-10 pr-4 py-2 text-xs text-[#3D3D3D] outline-none focus:border-[#CC7A5C] transition-colors"
            id="friend-search-input"
          />
        </div>

        {/* Filters Row */}
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-[9px] text-[#7D7B6D] uppercase font-mono font-bold block mb-0.5">City Hub</label>
            <select
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              className="w-full bg-[#F9F8F6] border border-[#EBE9E2] rounded-lg p-1.5 text-[11px] text-[#3D3D3D] outline-none focus:border-[#CC7A5C]"
              id="friend-city-select"
            >
              {cities.map((c) => (
                <option key={c} value={c}>
                  {c === 'all' ? 'All Cities' : c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[9px] text-[#7D7B6D] uppercase font-mono font-bold block mb-0.5">Contact Staleness</label>
            <select
              value={selectedStaleness}
              onChange={(e) => setSelectedStaleness(e.target.value)}
              className="w-full bg-[#F9F8F6] border border-[#EBE9E2] rounded-lg p-1.5 text-[11px] text-[#3D3D3D] outline-none focus:border-[#CC7A5C]"
              id="friend-staleness-select"
            >
              <option value="all">All Channels</option>
              <option value="fresh">Fresh (≤7 days)</option>
              <option value="stale">Stale (8-30 days)</option>
              <option value="overdue">Overdue ({'>'}30 days)</option>
            </select>
          </div>
          <div>
            <label className="text-[9px] text-[#7D7B6D] uppercase font-mono font-bold block mb-0.5">Ride Logistics</label>
            <select
              value={selectedLogistics}
              onChange={(e) => setSelectedLogistics(e.target.value)}
              className="w-full bg-[#F9F8F6] border border-[#EBE9E2] rounded-lg p-1.5 text-[11px] text-[#3D3D3D] outline-none focus:border-[#CC7A5C]"
              id="friend-logistics-select"
            >
              <option value="all">All Logistics</option>
              <option value="can_drive">🚗 Self-Drive</option>
              <option value="needs_ride">🚌 Needs Ride</option>
            </select>
          </div>
        </div>
      </div>

      {/* Friends grid scroll area */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1" id="friend-items-container">
        {filteredFriends.map((friend) => {
          const days = getDaysSinceContact(friend.contact?.lastContactDate);
          const category = getStalenessCategory(days);
          const isSelected = selectedFriendId === friend.id;

          // Color codes for staleness
          let badgeStyle = 'bg-[#F0EEE6] text-[#7D7B6D]';
          let borderStyle = 'border-[#EBE9E2] hover:border-[#CC7A5C]/40';

          if (category === 'fresh') {
            badgeStyle = 'bg-[#25D366]/10 text-[#1e8544] border border-[#25D366]/20 font-bold';
          } else if (category === 'stale') {
            badgeStyle = 'bg-[#faedcd]/40 text-[#b25e1d] border border-[#faedcd] font-bold';
          } else if (category === 'overdue') {
            badgeStyle = 'bg-[#CC7A5C]/10 text-[#CC7A5C] border border-[#CC7A5C]/30 font-bold';
            borderStyle = 'border-[#CC7A5C]/30 hover:border-[#CC7A5C]';
          }

          if (isSelected) {
            borderStyle = 'border-[#CC7A5C] ring-2 ring-[#CC7A5C]/20 bg-[#FBFBF9]';
          }

          return (
            <div
              key={friend.id}
              onClick={() => onSelectFriend(friend.id === selectedFriendId ? null : friend.id)}
              className={`p-4 bg-white border rounded-2xl transition-all cursor-pointer flex flex-col justify-between ${borderStyle}`}
              id={`friend-row-${friend.id}`}
            >
              {/* Header Row */}
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-serif font-bold text-[#2D2D20] text-sm truncate">{friend.name}</span>
                  </div>
                  <div className="flex items-center space-x-1 text-[#7D7B6D] text-[11px] mt-0.5">
                    <MapPin className="w-3 h-3 text-[#9B988C]" />
                    <span>{friend.location?.city || 'Unknown'}</span>
                  </div>
                </div>

                <div className="flex flex-col items-end space-y-1">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${badgeStyle}`}>
                    {days <= 0 ? 'Contacted today' : `${days}d ago`}
                  </span>
                  {getContactIcon(friend.contact?.primary)}
                </div>
              </div>

              {/* Tags and Handle */}
              <div className="mt-2 flex items-center justify-between">
                <div className="flex flex-wrap gap-1">
                  {friend.tags?.map((tag) => (
                    <span
                      key={tag}
                      className="bg-[#F9F8F6] text-[#5A5A40] text-[9px] px-2 py-0.5 rounded-md font-medium border border-[#EBE9E2] flex items-center space-x-0.5"
                    >
                      <Tag className="w-2.5 h-2.5 text-[#9B988C]" />
                      <span>{tag}</span>
                    </span>
                  ))}
                </div>
                {friend.contact?.handle && (
                  <span className="text-[11px] font-mono text-[#7D7B6D] truncate max-w-[150px]">
                    {friend.contact.handle}
                  </span>
                )}
              </div>

              {/* Ride status & logistical logs */}
              <div className="mt-3 pt-2.5 border-t border-[#F2F0EA] flex items-center justify-between">
                <div className="flex items-center space-x-1.5 text-xs">
                  {friend.logistics?.canDrive ? (
                    <span className="text-[#1e8544] font-medium flex items-center space-x-1 font-mono text-[11px]">
                      <Car className="w-3.5 h-3.5" />
                      <span>🚗 Self-Drive</span>
                    </span>
                  ) : friend.logistics?.pickupRequired ? (
                    <span className="text-[#CC7A5C] font-medium flex items-center space-x-1 font-mono text-[11px]">
                      <AlertTriangle className="w-3.5 h-3.5 text-[#CC7A5C]" />
                      <span>🚌 Needs ride</span>
                    </span>
                  ) : (
                    <span className="text-[#7D7B6D] font-mono text-[11px]">No logistics info</span>
                  )}
                </div>

                {/* Quick trigger actions */}
                <div className="flex items-center space-x-1.5">
                  {(() => {
                    const btnStyle = getButtonStyles(friend.contact?.primary);
                    return (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRecordContact(friend.id);
                        }}
                        style={{ borderColor: btnStyle.borderColor, color: btnStyle.color }}
                        className={`px-2.5 py-1 bg-[#FBFBF9] ${btnStyle.hoverClass} text-[10px] font-bold border rounded-lg transition-all flex items-center space-x-1 shadow-2xs`}
                        title="Mark as Contacted Today"
                        id={`record-contact-${friend.id}`}
                      >
                        <Check className="w-3 h-3" />
                        <span className="hidden sm:inline">Mark Contacted</span>
                      </button>
                    );
                  })()}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteFriend(friend.id);
                    }}
                    className="p-1 text-[#9B988C] hover:text-[#CC7A5C] hover:bg-[#F9F8F6] rounded-lg transition-all"
                    title="Remove Friend"
                    id={`delete-friend-${friend.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Logistics details notes (collapsible or displayed when selected) */}
              {isSelected && friend.logistics?.notes && (
                <div className="mt-2.5 pt-2 border-t border-[#F0EEE6] text-[11px] text-[#7D7B6D] italic">
                  Note: {'"'}{friend.logistics.notes}{'"'}
                </div>
              )}
            </div>
          );
        })}

        {filteredFriends.length === 0 && (
          <div className="text-center py-12 px-4 bg-[#FBFBF9] border border-dashed border-[#E0DED7] rounded-2xl text-[#9B988C] flex flex-col items-center justify-center space-y-2">
            <UserX className="w-8 h-8 text-[#9B988C]/60" />
            <p className="text-xs">No friends match the search or filter settings.</p>
          </div>
        )}
      </div>
    </div>
  );
}