/**
 * @fileoverview Type definitions for Friend Dashboard using JSDoc
 * @license SPDX-License-Identifier: Apache-2.0
 */

/**
 * @typedef {Object} ContactInfo
 * @property {boolean} [phone]
 * @property {boolean} [whatsapp]
 * @property {string|boolean} [discord]
 * @property {string|boolean} [instagram]
 * @property {'phone'|'whatsapp'|'discord'|'instagram'} [primary]
 * @property {string} [lastContactDate] ISO date-time string
 */

/**
 * @typedef {Object} TemporaryLocation
 * @property {string|null} [startDate] ISO date-time string
 * @property {string|null} [endDate] ISO date-time string
 * @property {string|null} [poiId]
 */

/**
 * @typedef {Object} LocationInfo
 * @property {string} [homePoiId]
 * @property {TemporaryLocation} [temporaryLocation]
 */

/**
 * @typedef {Object} LogisticsInfo
 * @property {boolean} [canDrive]
 * @property {boolean} [pickupRequired]
 * @property {string|null} [pickupPoiId]
 */

/**
 * @typedef {Object} PlanningInfo
 * @property {string[]} [hangoutIds] List of hangout IDs
 * @property {string[]} [placeIdeas] List of POI IDs
 * @property {string} [notes]
 */

/**
 * @typedef {Object} Friend
 * @property {string} id
 * @property {string} name
 * @property {string[]} [tags]
 * @property {ContactInfo} contact
 * @property {LocationInfo} location
 * @property {LogisticsInfo} logistics
 * @property {PlanningInfo} planning
 * @property {string} [notes] Top-level notes field (same as Group schema)
 */

/**
 * @typedef {Object} Group
 * @property {string} id
 * @property {string} name
 * @property {string[]} memberIds
 * @property {PlanningInfo} planning
 * @property {string} [notes]
 */

/**
 * @typedef {Object} Hangout
 * @property {string} id
 * @property {'physical'|'virtual'} type
 * @property {string} datetime ISO date-time string
 * @property {string|null} [locationPoiId] Null for virtual hangouts
 * @property {string} [description]
 */

/**
 * @typedef {Object} POI
 * @property {string} id
 * @property {string} name
 * @property {{lat: number, lng: number, address?: string, googlePlaceId?: string}} location
 * @property {string} [link]
 * @property {string} [date]
 * @property {{access: 'private'|'public', scope: 'selective'|'all', allowedMapIds?: string[]}} [visibility]
 * @property {string} [notes]
 */

/**
 * @typedef {Object} HangoutHistoryItem
 * @property {string} [id]
 * @property {string} title
 * @property {string} datetime ISO date-time string
 * @property {string[]} friendIds
 * @property {string} [details]
 */

/**
 * @typedef {Object} PlannedHangout
 * @property {string} id
 * @property {string} title
 * @property {string} groupId
 * @property {'physical'|'virtual'} type
 * @property {string} datetime ISO date-time string
 * @property {string} [location]
 * @property {string} [details]
 */