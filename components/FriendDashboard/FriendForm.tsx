/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Friend } from '../types';
import { UserPlus, Plus, X } from 'lucide-react';

interface FriendFormProps {
  onAddFriend: (friend: Friend) => void;
  onClose: () => void;
}

export default function FriendForm({ onAddFriend, onClose }: FriendFormProps) {
  const [name, setName] = useState('');
  const [city, setCity] = useState('Santa Cruz');
  const [primaryChannel, setPrimaryChannel] = useState<'phone' | 'whatsapp' | 'discord' | 'email' | 'instagram'>('phone');
  const [handle, setHandle] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [canDrive, setCanDrive] = useState(false);
  const [pickupRequired, setPickupRequired] = useState(false);
  const [logisticsNotes, setLogisticsNotes] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const parsedTags = tagsInput
      .split(',')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0);

    const newFriend: Friend = {
      id: `${name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`,
      name: name.trim(),
      tags: parsedTags.length > 0 ? parsedTags : ['Friend'],
      contact: {
        primary: primaryChannel,
        handle: handle.trim() || undefined,
        lastContactDate: new Date().toISOString()
      },
      location: {
        city
      },
      logistics: {
        canDrive,
        pickupRequired,
        notes: logisticsNotes.trim() || undefined
      }
    };

    onAddFriend(newFriend);
    
    // Reset form
    setName('');
    setHandle('');
    setTagsInput('');
    setCanDrive(false);
    setPickupRequired(false);
    setLogisticsNotes('');
    onClose();
  };

  return (
    <div className="bg-[#FBFBF9] border border-[#EBE9E2] rounded-2xl p-5 mb-5 shadow-xs transition-all animate-fade-in" id="friend-form">
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#EBE9E2]">
        <div className="flex items-center space-x-2 text-[#2D2D20]">
          <UserPlus className="w-4 h-4 text-[#CC7A5C]" />
          <h4 className="font-serif font-bold text-sm">Add New Friend</h4>
        </div>
        <button 
          onClick={onClose} 
          type="button"
          className="text-[#9B988C] hover:text-[#2D2D20] p-1 rounded-full hover:bg-[#F0EEE6] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Column 1 */}
          <div className="space-y-3">
            <div>
              <label className="text-[10px] text-[#7D7B6D] font-mono uppercase tracking-wider block mb-1">Full Name</label>
              <input
                type="text"
                required
                placeholder="E.g. Marcus Brody"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full bg-white border border-[#E0DED7] rounded-xl px-3 py-1.5 text-xs text-[#3D3D3D] focus:border-[#CC7A5C] outline-none transition-colors"
              />
            </div>

            <div>
              <label className="text-[10px] text-[#7D7B6D] font-mono uppercase tracking-wider block mb-1">City Hub</label>
              <select
                value={city}
                onChange={e => setCity(e.target.value)}
                className="w-full bg-white border border-[#E0DED7] rounded-xl px-3 py-1.5 text-xs text-[#3D3D3D] focus:border-[#CC7A5C] outline-none transition-colors"
              >
                <option value="Santa Cruz">Santa Cruz</option>
                <option value="Fremont">Fremont</option>
                <option value="Mountain View">Mountain View</option>
                <option value="San Jose">San Jose</option>
                <option value="San Francisco">San Francisco</option>
                <option value="Oakland">Oakland</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] text-[#7D7B6D] font-mono uppercase tracking-wider block mb-1">Tags (Comma separated)</label>
              <input
                type="text"
                placeholder="E.g. UCSC, Hiking, Outdoors"
                value={tagsInput}
                onChange={e => setTagsInput(e.target.value)}
                className="w-full bg-white border border-[#E0DED7] rounded-xl px-3 py-1.5 text-xs text-[#3D3D3D] focus:border-[#CC7A5C] outline-none transition-colors"
              />
            </div>
          </div>

          {/* Column 2 */}
          <div className="space-y-3">
            <div>
              <label className="text-[10px] text-[#7D7B6D] font-mono uppercase tracking-wider block mb-1">Primary Channel</label>
              <select
                value={primaryChannel}
                onChange={e => setPrimaryChannel(e.target.value as any)}
                className="w-full bg-white border border-[#E0DED7] rounded-xl px-3 py-1.5 text-xs text-[#3D3D3D] focus:border-[#CC7A5C] outline-none transition-colors"
              >
                <option value="phone">Phone Call</option>
                <option value="discord">Discord</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="instagram">Instagram</option>
                <option value="email">Email</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] text-[#7D7B6D] font-mono uppercase tracking-wider block mb-1">Handle / Number / Detail</label>
              <input
                type="text"
                placeholder={
                  primaryChannel === 'phone' ? '+1 (555) 000-0000' :
                  primaryChannel === 'discord' ? 'username#1234' :
                  primaryChannel === 'whatsapp' ? '+1 (555) 000-0000' :
                  primaryChannel === 'instagram' ? '@insta_handle' :
                  'email@example.com'
                }
                value={handle}
                onChange={e => setHandle(e.target.value)}
                className="w-full bg-white border border-[#E0DED7] rounded-xl px-3 py-1.5 text-xs text-[#3D3D3D] focus:border-[#CC7A5C] outline-none transition-colors"
              />
            </div>

            {/* Ride Logistics Toggles */}
            <div>
              <label className="text-[10px] text-[#7D7B6D] font-mono uppercase tracking-wider block mb-1">Ride Logistics</label>
              <div className="flex space-x-4 pt-1">
                <label className="flex items-center space-x-2 text-xs text-[#3D3D3D] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={canDrive}
                    onChange={e => {
                      setCanDrive(e.target.checked);
                      if (e.target.checked) setPickupRequired(false);
                    }}
                    className="rounded border-[#E0DED7] text-[#CC7A5C] focus:ring-0 w-4 h-4 cursor-pointer"
                  />
                  <span>🚗 Can Drive</span>
                </label>
                <label className="flex items-center space-x-2 text-xs text-[#3D3D3D] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pickupRequired}
                    onChange={e => {
                      setPickupRequired(e.target.checked);
                      if (e.target.checked) setCanDrive(false);
                    }}
                    className="rounded border-[#E0DED7] text-[#CC7A5C] focus:ring-0 w-4 h-4 cursor-pointer"
                  />
                  <span>🚌 Needs Ride</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <div>
          <label className="text-[10px] text-[#7D7B6D] font-mono uppercase tracking-wider block mb-1">Logistics & Availability Notes</label>
          <textarea
            rows={2}
            placeholder="E.g. Has a car, can host, free on Saturday afternoons..."
            value={logisticsNotes}
            onChange={e => setLogisticsNotes(e.target.value)}
            className="w-full bg-white border border-[#E0DED7] rounded-xl px-3 py-1.5 text-xs text-[#3D3D3D] focus:border-[#CC7A5C] outline-none transition-colors"
          />
        </div>

        <div className="flex justify-end space-x-2 pt-2 border-t border-[#EBE9E2]">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-[#7D7B6D] hover:text-[#2D2D20] transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-1.5 bg-[#CC7A5C] hover:bg-[#b86649] text-white text-xs font-bold rounded-xl flex items-center space-x-1 shadow-sm transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Save Friend</span>
          </button>
        </div>
      </form>
    </div>
  );
}
