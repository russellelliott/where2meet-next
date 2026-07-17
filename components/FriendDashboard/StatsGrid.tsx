/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Friend, PlannedHangout } from '../types';
import { Users, Car, Clock, Calendar } from 'lucide-react';

interface StatsGridProps {
  friends: Friend[];
  plannedHangouts: PlannedHangout[];
}

export default function StatsGrid({ friends, plannedHangouts }: StatsGridProps) {
  const totalFriends = friends.length;
  
  // Logistics
  const canDriveCount = friends.filter(f => f.logistics.canDrive).length;
  const needsRideCount = friends.filter(f => f.logistics.pickupRequired).length;

  // Contact Staleness (relative to July 12, 2026)
  const CURRENT_TIME = new Date('2026-07-12T16:00:00Z');
  
  const getDaysSinceContact = (dateStr: string) => {
    const lastDate = new Date(dateStr);
    const diffTime = CURRENT_TIME.getTime() - lastDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return isNaN(diffDays) ? 0 : diffDays;
  };

  const freshCount = friends.filter(f => getDaysSinceContact(f.contact.lastContactDate) <= 7).length;
  const staleCount = friends.filter(f => {
    const days = getDaysSinceContact(f.contact.lastContactDate);
    return days > 7 && days <= 30;
  }).length;
  const overdueCount = friends.filter(f => getDaysSinceContact(f.contact.lastContactDate) > 30).length;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6" id="stats-grid">
      {/* Stat 1: Total Friends */}
      <div className="bg-white border border-[#EBE9E2] rounded-2xl p-4 flex items-center space-x-3 shadow-xs">
        <div className="p-2.5 bg-[#F9F8F6] rounded-xl border border-[#EBE9E2] text-[#666666]">
          <Users className="w-5 h-5" />
        </div>
        <div>
          <span className="text-[10px] uppercase font-mono text-[#7D7B6D] tracking-wider block">Total Friends</span>
          <span className="text-xl font-semibold text-[#2D2D20]">{totalFriends}</span>
        </div>
      </div>

      {/* Stat 2: Logistics */}
      <div className="bg-white border border-[#EBE9E2] rounded-2xl p-4 flex items-center space-x-3 shadow-xs">
        <div className="p-2.5 bg-[#F9F8F6] rounded-xl border border-[#EBE9E2] text-[#CC7A5C]">
          <Car className="w-5 h-5" />
        </div>
        <div>
          <span className="text-[10px] uppercase font-mono text-[#7D7B6D] tracking-wider block">Ride Logistics</span>
          <span className="text-xs font-medium text-[#2D2D20] block">
            🚗 {canDriveCount} Drivers
          </span>
          <span className="text-xs font-medium text-[#CC7A5C] block">
            🚌 {needsRideCount} Need Rides
          </span>
        </div>
      </div>

      {/* Stat 3: Staleness */}
      <div className="bg-white border border-[#EBE9E2] rounded-2xl p-4 flex items-center space-x-3 shadow-xs">
        <div className="p-2.5 bg-[#F9F8F6] rounded-xl border border-[#EBE9E2] text-[#25D366]">
          <Clock className="w-5 h-5" />
        </div>
        <div>
          <span className="text-[10px] uppercase font-mono text-[#7D7B6D] tracking-wider block">Staleness Log</span>
          <span className="text-[11px] font-medium text-[#2D2D20] block">
            🟢 {freshCount} Fresh (≤7d)
          </span>
          <span className="text-[11px] font-medium text-[#CC7A5C] block">
            🟡 {staleCount} Stale | 🔴 {overdueCount} Overdue
          </span>
        </div>
      </div>

      {/* Stat 4: Commitments */}
      <div className="bg-white border border-[#EBE9E2] rounded-2xl p-4 flex items-center space-x-3 shadow-xs">
        <div className="p-2.5 bg-[#F9F8F6] rounded-xl border border-[#EBE9E2] text-[#5865F2]">
          <Calendar className="w-5 h-5" />
        </div>
        <div>
          <span className="text-[10px] uppercase font-mono text-[#7D7B6D] tracking-wider block">Upcoming events</span>
          <span className="text-xl font-semibold text-[#2D2D20]">{plannedHangouts.length}</span>
          <span className="text-[10px] text-[#7D7B6D] block">Pending syncs</span>
        </div>
      </div>
    </div>
  );
}
