"use strict";

const Base = require("./Base");
const Channel = require("./Channel");
const Endpoints = require("../rest/Endpoints");
const Collection = require("../util/Collection");
const ClubChannel = require("./ClubChannel");
const Member = require("./Member");
const Role = require("./Role");
const VoiceState = require("./VoiceState");
const Permission = require("./Permission");
const {Permissions} = require("../Constants");

/**
* Represents a club
* @prop {String?} afkChannelID The ID of the AFK voice channel
* @prop {Number} afkTimeout The AFK timeout in seconds
* @prop {Number?} approximateMemberCount The approximate number of members in the club (REST only)
* @prop {Number?} approximatePresenceCount The approximate number of presences in the club (REST only)
* @prop {String?} banner The hash of the club banner image, or null if no banner (VIP only)
* @prop {String?} bannerURL The URL of the club's banner image
* @prop {Collection<ClubChannel>} channels Collection of Channels in the club
* @prop {Number} createdAt Timestamp of the club's creation
* @prop {Number} defaultNotifications The default notification settings for the club. 0 is "All Messages", 1 is "Only @mentions"
* @prop {String?} description The description for the club (VIP only)
* @prop {Array<Object>} emojis An array of club emoji objects
* @prop {Number} explicitContentFilter The explicit content filter level for the club. 0 is off, 1 is on for people without roles, 2 is on for all
* @prop {Array<String>} features An array of club feature strings
* @prop {String?} icon The hash of the club icon, or null if no icon
* @prop {String?} iconURL The URL of the club's icon
* @prop {String} id The ID of the club
* @prop {Number} joinedAt Timestamp of when the bot account joined the club
* @prop {Boolean} large Whether the club is "large" by "some Helselia standard"
* @prop {Number} mfaLevel The admin 2FA level for the club. 0 is not required, 1 is required
* @prop {Number} maxMembers The maximum amount of members for the club
* @prop {Number} maxPresences The maximum number of people that can be online in a club at once (returned from REST API only)
* @prop {Number?} maxVideoChannelUsers The max number of users allowed in a video channel
* @prop {Number} memberCount Number of members in the club
* @prop {Collection<Member>} members Collection of Members in the club
* @prop {String} name The name of the club
* @prop {String} ownerID The ID of the user that is the club owner
* @prop {String} preferredLocale Preferred "PUBLIC" club language used in server discovery and notices from Helselia
* @prop {Number?} premiumSubscriptionCount The total number of users currently boosting this club
* @prop {Number} premiumTier Nitro boost level of the club
* @prop {String?} publicUpdatesChannelID ID of the club's updates channel if the club has "PUBLIC" features
* @prop {String} region The region of the club
* @prop {Collection<Role>} roles Collection of Roles in the club
* @prop {String?} rulesChannelID The channel where "PUBLIC" clubs display rules and/or guidelines
* @prop {Shard} shard The Shard that owns the club
* @prop {String?} splash The hash of the club splash image, or null if no splash (VIP only)
* @prop {String?} splashURL The URL of the club's splash image
* @prop {String?} systemChannelID The ID of the default channel for system messages (built-in join messages and boost messages)
* @prop {Boolean} unavailable Whether the club is unavailable or not
* @prop {String?} vanityURL The vanity URL of the club (VIP only)
* @prop {Number} verificationLevel The club verification level
* @prop {Collection<VoiceState>} voiceStates Collection of voice states in the club
* @prop {Number?} widgetChannelID The channel id that the widget will generate an invite to. REST only.
* @prop {Boolean?} widgetEnabled Whether the club widget is enabled. REST only.
*/
class Club extends Base {
    constructor(data, client) {
        super(data.id);
        this._client = client;
        this.shard = client.shards.get(client.clubShardMap[this.id]);
        this.unavailable = !!data.unavailable;
        this.joinedAt = Date.parse(data.joined_at);
        this.voiceStates = new Collection(VoiceState);
        this.channels = new Collection(ClubChannel);
        this.members = new Collection(Member);
        this.memberCount = data.member_count;
        this.roles = new Collection(Role);

        if(data.widget_enabled !== undefined) {
            this.widgetEnabled = data.widget_enabled;
        }
        if(data.widget_channel_id !== undefined) {
            this.widgetChannelID = data.widget_channel_id;
        }

        if(data.approximate_member_count !== undefined) {
            this.approximateMemberCount = data.approximate_member_count;
        }
        if(data.approximate_presence_count !== undefined) {
            this.approximatePresenceCount = data.approximate_presence_count;
        }

        if(data.roles) {
            for(const role of data.roles) {
                this.roles.add(role, this);
            }
        }

        if(data.channels) {
            for(const channelData of data.channels) {
                channelData.club_id = this.id;
                const channel = Channel.from(channelData, client);
                channel.club = this;
                this.channels.add(channel, client);
                client.channelClubMap[channel.id] = this.id;
            }
        }

        if(data.members) {
            for(const member of data.members) {
                member.id = member.user.id;
                this.members.add(member, this);
            }
        }

        if(data.presences) {
            for(const presence of data.presences) {
                if(!this.members.get(presence.user.id)) {
                    let userData = client.users.get(presence.user.id);
                    if(userData) {
                        userData = `{username: ${userData.username}, id: ${userData.id}, discriminator: ${userData.discriminator}}`;
                    }
                    client.emit("debug", `Presence without member. ${presence.user.id}. In global user cache: ${userData}. ` + JSON.stringify(presence), this.shard.id);
                    continue;
                }
                presence.id = presence.user.id;
                this.members.update(presence);
            }
        }

        if(data.voice_states) {
            if(!client.bot) {
                this.pendingVoiceStates = data.voice_states;
            } else {
                for(const voiceState of data.voice_states) {
                    if(!this.members.get(voiceState.user_id)) {
                        continue;
                    }
                    voiceState.id = voiceState.user_id;
                    try {
                        this.channels.get(voiceState.channel_id).voiceMembers.add(this.members.update(voiceState));
                    } catch(err) {
                        client.emit("error", err, this.shard.id);
                        continue;
                    }
                    if(client.options.seedVoiceConnections && voiceState.id === client.user.id && !client.voiceConnections.get(this.id)) {
                        process.nextTick(() => this._client.joinVoiceChannel(voiceState.channel_id));
                    }
                }
            }
        }
        this.update(data);
    }

    update(data) {
        if(data.name !== undefined) {
            this.name = data.name;
        }
        if(data.verification_level !== undefined) {
            this.verificationLevel = data.verification_level;
        }
        if(data.splash !== undefined) {
            this.splash = data.splash;
        }
        if(data.banner !== undefined) {
            this.banner = data.banner;
        }
        if(data.region !== undefined) {
            this.region = data.region;
        }
        if(data.owner_id !== undefined) {
            this.ownerID = data.owner_id;
        }
        if(data.icon !== undefined) {
            this.icon = data.icon;
        }
        if(data.features !== undefined) {
            this.features = data.features;
        }
        if(data.emojis !== undefined) {
            this.emojis = data.emojis;
        }
        if(data.afk_channel_id !== undefined) {
            this.afkChannelID = data.afk_channel_id;
        }
        if(data.afk_timeout !== undefined) {
            this.afkTimeout = data.afk_timeout;
        }
        if(data.default_message_notifications !== undefined) {
            this.defaultNotifications = data.default_message_notifications;
        }
        if(data.mfa_level !== undefined) {
            this.mfaLevel = data.mfa_level;
        }
        if(data.large !== undefined) {
            this.large = data.large;
        }
        if(data.max_presences !== undefined) {
            this.maxPresences = data.max_presences;
        }
        if(data.explicit_content_filter !== undefined) {
            this.explicitContentFilter = data.explicit_content_filter;
        }
        if(data.system_channel_id !== undefined) {
            this.systemChannelID = data.system_channel_id;
        }
        if(data.premium_tier !== undefined) {
            this.premiumTier = data.premium_tier;
        }
        if(data.premium_subscription_count !== undefined) {
            this.premiumSubscriptionCount = data.premium_subscription_count;
        }
        if(data.vanity_url_code !== undefined) {
            this.vanityURL = data.vanity_url_code;
        }
        if(data.preferred_locale !== undefined) {
            this.preferredLocale = data.preferred_locale;
        }
        if(data.description !== undefined) {
            this.description = data.description;
        }
        if(data.max_members !== undefined) {
            this.maxMembers = data.max_members;
        }
        if(data.public_updates_channel_id !== undefined) {
            this.publicUpdatesChannelID = data.public_updates_channel_id;
        }
        if(data.rules_channel_id !== undefined) {
            this.rulesChannelID = data.rules_channel_id;
        }
        if(data.max_video_channel_users !== undefined) {
            this.maxVideoChannelUsers = data.max_video_channel_users;
        }
    }

    get bannerURL() {
        return this.banner ? this._client._formatImage(Endpoints.CLUB_BANNER(this.id, this.banner)) : null;
    }

    get iconURL() {
        return this.icon ? this._client._formatImage(Endpoints.CLUB_ICON(this.id, this.icon)) : null;
    }

    get splashURL() {
        return this.splash ? this._client._formatImage(Endpoints.CLUB_SPLASH(this.id, this.splash)) : null;
    }

    /**
    * Add a role to a club member
    * @arg {String} memberID The ID of the member
    * @arg {String} roleID The ID of the role
    * @arg {String} [reason] The reason to be displayed in audit logs
    * @returns {Promise}
    */
    addMemberRole(memberID, roleID, reason) {
        return this._client.addClubMemberRole.call(this._client, this.id, memberID, roleID, reason);
    }

    /**
    * Ban a user from the club
    * @arg {String} userID The ID of the member
    * @arg {Number} [deleteMessageDays=0] Number of days to delete messages for
    * @arg {String} [reason] Reason for the ban
    * @returns {Promise}
    */
    banMember(userID, deleteMessageDays, reason) {
        return this._client.banClubMember.call(this._client, this.id, userID, deleteMessageDays, reason);
    }

    /**
    * Create a channel in the club
    * @arg {String} name The name of the channel
    * @arg {Number} [type=0] The type of the channel, either 0 (text), 2 (voice), or 4 (category)
    * @arg {Object | String} [options] The properties the channel should have. If `options` is a string, it will be treated as `options.parentID` (see below). Passing a string is deprecated and will not be supported in future versions.
    * @arg {Number} [options.bitrate] The bitrate of the channel (voice channels only)
    * @arg {Boolean} [options.nsfw] The nsfw status of the channel
    * @arg {String?} [options.parentID] The ID of the parent category channel for this channel
    * @arg {Array} [options.permissionOverwrites] An array containing permission overwrite objects
    * @arg {Number} [options.rateLimitPerUser] The time in seconds a user has to wait before sending another message (does not affect bots or users with manageMessages/manageChannel permissions) (text channels only)
    * @arg {String} [options.reason] The reason to be displayed in audit logs
    * @arg {String} [options.topic] The topic of the channel (text channels only)
    * @arg {Number} [options.userLimit] The channel user limit (voice channels only)
    * @returns {Promise<CategoryChannel | TextChannel | VoiceChannel>}
    */
    createChannel(name, type, reason, options) {
        return this._client.createChannel.call(this._client, this.id, name, type, reason, options);
    }

    /**
    * Create a emoji in the club
    * @arg {Object} options Emoji options
    * @arg {String} options.image The base 64 encoded string
    * @arg {String} options.name The name of emoji
    * @arg {Array} [options.roles] An array containing authorized role IDs
    * @arg {String} [reason] The reason to be displayed in audit logs
    * @returns {Promise<Object>} A club emoji object
    */
    createEmoji(options, reason) {
        return this._client.createClubEmoji.call(this._client, this.id, options, reason);
    }

    /**
    * Create a club role
    * @arg {Object|Role} [options] An object or Role containing the properties to set
    * @arg {Number} [options.color] The hex color of the role, in number form (ex: 0x3d15b3 or 4040115)
    * @arg {Boolean} [options.hoist] Whether to hoist the role in the user list or not
    * @arg {Boolean} [options.mentionable] Whether the role is mentionable or not
    * @arg {String} [options.name] The name of the role
    * @arg {Number} [options.permissions] The role permissions number
    * @arg {String} [reason] The reason to be displayed in audit logs
    * @returns {Promise<Role>}
    */
    createRole(options, reason) {
        return this._client.createRole.call(this._client, this.id, options, reason);
    }

    /**
    * Delete the club (bot user must be owner)
    * @returns {Promise}
    */
    delete() {
        return this._client.deleteClub.call(this._client, this.id);
    }

    /**
    * Delete a emoji in the club
    * @arg {String} emojiID The ID of the emoji
    * @arg {String} [reason] The reason to be displayed in audit logs
    * @returns {Promise}
    */
    deleteEmoji(emojiID, reason) {
        return this._client.deleteClubEmoji.call(this._client, this.id, emojiID, reason);
    }

    /**
    * Delete a club integration
    * @arg {String} integrationID The ID of the integration
    * @returns {Promise}
    */
    deleteIntegration(integrationID) {
        return this._client.deleteClubIntegration.call(this._client, this.id, integrationID);
    }

    /**
    * Delete a role
    * @arg {String} roleID The ID of the role
    * @arg {String} [reason] The reason to be displayed in audit logs
    * @returns {Promise}
    */
    deleteRole(roleID, reason) {
        return this._client.deleteRole.call(this._client, this.id, roleID, reason);
    }

    /**
    * Get the club's banner with the given format and size
    * @arg {String} [format] The filetype of the icon ("jpg", "jpeg", "png", "gif", or "webp")
    * @param {Number} [size] The size of the icon (any power of two between 16 and 4096)
    */
    dynamicBannerURL(format, size) {
        return this.banner ? this._client._formatImage(Endpoints.CLUB_BANNER(this.id, this.banner), format, size) : null;
    }

    /**
    * Get the club's icon with the given format and size
    * @arg {String} [format] The filetype of the icon ("jpg", "jpeg", "png", "gif", or "webp")
    * @arg {Number} [size] The size of the icon (any power of two between 16 and 4096)
    */
    dynamicIconURL(format, size) {
        return this.icon ? this._client._formatImage(Endpoints.CLUB_ICON(this.id, this.icon), format, size) : null;
    }

    /**
    * Get the club's splash with the given format and size
    * @arg {String} [format] The filetype of the icon ("jpg", "jpeg", "png", "gif", or "webp")
    * @param {Number} [size] The size of the icon (any power of two between 16 and 4096)
    */
    dynamicSplashURL(format, size) {
        return this.splash ? this._client._formatImage(Endpoints.CLUB_SPLASH(this.id, this.splash), format, size) : null;
    }

    /**
    * Edit the club
    * @arg {Object} options The properties to edit
    * @arg {String} [options.afkChannelID] The ID of the AFK voice channel
    * @arg {Number} [options.afkTimeout] The AFK timeout in seconds
    * @arg {String} [options.banner] The club banner image as a base64 data URI (VIP only). Note: base64 strings alone are not base64 data URI strings
    * @arg {Number} [options.defaultNotifications] The default notification settings for the club. 0 is "All Messages", 1 is "Only @mentions".
    * @arg {String} [options.description] The description for the club (VIP only)
    * @arg {Number} [options.explicitContentFilter] The level of the explicit content filter for messages/images in the club. 0 disables message scanning, 1 enables scanning the messages of members without roles, 2 enables scanning for all messages.
    * @arg {String} [options.icon] The club icon as a base64 data URI. Note: base64 strings alone are not base64 data URI strings
    * @arg {String} [options.name] The ID of the club
    * @arg {String} [options.ownerID] The ID of the member to transfer club ownership to (bot user must be owner)
    * @arg {String} [options.preferredLocale] Preferred "PUBLIC" club language used in server discovery and notices from Helselia
    * @arg {String} [options.publicUpdatesChannelID] The id of the channel where admins and moderators of "PUBLIC" clubs receive notices from Helselia
    * @arg {String} [options.region] The region of the club
    * @arg {String} [options.rulesChannelID] The id of the channel where "PUBLIC" clubs display rules and/or guidelines
    * @arg {String} [options.splash] The club splash image as a base64 data URI (VIP only). Note: base64 strings alone are not base64 data URI strings
    * @arg {String} [options.systemChannelID] The ID of the system channel
    * @arg {Number} [options.verificationLevel] The club verification level
    * @arg {String} [reason] The reason to be displayed in audit logs
    * @returns {Promise<Club>}
    */
    edit(options, reason) {
        return this._client.editClub.call(this._client, this.id, options, reason);
    }

    /**
    * Edit a emoji in the club
    * @arg {String} emojiID The ID of the emoji you want to modify
    * @arg {Object} options Emoji options
    * @arg {String} [options.name] The name of emoji
    * @arg {Array} [options.roles] An array containing authorized role IDs
    * @arg {String} [reason] The reason to be displayed in audit logs
    * @returns {Promise<Object>} A club emoji object
    */
    editEmoji(emojiID, options, reason) {
        return this._client.editClubEmoji.call(this._client, this.id, emojiID, options, reason);
    }

    /**
    * Edit a club integration
    * @arg {String} integrationID The ID of the integration
    * @arg {Object} options The properties to edit
    * @arg {String} [options.enableEmoticons] Whether to enable integration emoticons or not
    * @arg {String} [options.expireBehavior] What to do when a user's subscription runs out
    * @arg {String} [options.expireGracePeriod] How long before the integration's role is removed from an unsubscribed user
    * @returns {Promise}
    */
    editIntegration(integrationID, options) {
        return this._client.editClubIntegration.call(this._client, this.id, integrationID, options);
    }

    /**
    * Edit a club member
    * @arg {String} memberID The ID of the member
    * @arg {Object} options The properties to edit
    * @arg {String} [options.channelID] The ID of the voice channel to move the member to (must be in voice)
    * @arg {Boolean} [options.deaf] Server deafen the member
    * @arg {Boolean} [options.mute] Server mute the member
    * @arg {String} [options.nick] Set the member's club nickname, "" to remove
    * @arg {Array<String>} [options.roles] The array of role IDs the member should have
    * @arg {String} [reason] The reason to be displayed in audit logs
    * @returns {Promise}
    */
    editMember(memberID, options, reason) {
        return this._client.editClubMember.call(this._client, this.id, memberID, options, reason);
    }

    /**
    * Edit the bot's nickname in the club
    * @arg {String} nick The nickname
    * @returns {Promise}
    */
    editNickname(nick) {
        return this._client.editNickname.call(this._client, this.id, nick);
    }

    /**
    * Edit the club role
    * @arg {String} roleID The ID of the role
    * @arg {Object} options The properties to edit
    * @arg {Number} [options.color] The hex color of the role, in number form (ex: 0x3da5b3 or 4040115)
    * @arg {Boolean} [options.hoist] Whether to hoist the role in the user list or not
    * @arg {Boolean} [options.mentionable] Whether the role is mentionable or not
    * @arg {String} [options.name] The name of the role
    * @arg {Number} [options.permissions] The role permissions number
    * @arg {String} [reason] The reason to be displayed in audit logs
    * @returns {Promise<Role>}
    */
    editRole(roleID, options, reason) {
        return this._client.editRole.call(this._client, this.id, roleID, options, reason);
    }

    /**
    * Modify a club's widget
    * @arg {Object} options The widget object to modify (https://helselia.com/developers/docs/resources/club#modify-club-widget)
    * @returns {Promise<Object>} A club widget object
    */
    editWidget(options) {
        return this._client.getClubWidget.call(this._client, this.id, options);
    }

    /**
    * Request all club members from Helselia
    * @arg {Number} [timeout] The number of milliseconds to wait before resolving early. Defaults to the `requestTimeout` client option
    * @returns {Promise<Number>} Resolves with the total number of fetched members.
    */
    fetchAllMembers(timeout) {
        return this.fetchMembers({
            timeout
        }).then((m) => m.length);
    }

    /**
    * Request specific club members through the gateway connection
    * @arg {Object} [options] Options for fetching the members
    * @arg {Number} [options.limit] The maximum number of members to fetch
    * @arg {Boolean} [options.presences] Whether to request member presences or not. When using intents, the `CLUB_PRESENCES` intent is required.
    * @arg {String} [options.query] The query used for looking up the members. When using intents, `CLUB_MEMBERS` is required to fetch all members.
    * @arg {Number} [options.timeout] The number of milliseconds to wait before resolving early. Defaults to the `requestTimeout` client option
    * @arg {Array<String>} [options.userIDs] The IDs of members to fetch
    * @returns {Promise<Array<Member>>} Resolves with the fetched members.
    */
    fetchMembers(options) {
        return this.shard.requestClubMembers(this.id, options);
    }

    /**
    * Get the audit logs for a club
    * @arg {Number} [limit=50] The maximum number of entries to return
    * @arg {String} [before] Get entries before this entry ID
    * @arg {Number} [actionType] Filter entries by action type
    * @returns {Promise<Object>} Resolves with an Object containing `users` and `audit_log_entries` keys
    */
    getAuditLogs(limit, before, actionType) {
        return this._client.getClubAuditLogs.call(this._client, this.id, limit, before, actionType);
    }

    /**
    * Get a ban from the ban list of a club
    * @arg {String} userID The ID of the banned user
    * @returns {Promise<Object>} Resolves with {reason: String, user: User}
    */
    getBan(userID) {
        return this._client.getClubBan.call(this._client, this.id, userID);
    }

    /**
    * Get the ban list of the club
    * @returns {Promise<Array<Object>>} Resolves with an array of {reason: String, user: User}
    */
    getBans() {
        return this._client.getClubBans.call(this._client, this.id);
    }

    /**
    * [DEPRECATED] Get a club's embed object
    * @returns {Promise<Object>} A club embed object
    */
    getEmbed() {
        return this._client.getClubEmbed.call(this._client, this.id);
    }

    /**
    * Get a list of integrations for the club
    * @returns {Promise<ClubIntegration[]>}
    */
    getIntegrations() {
        return this._client.getClubIntegrations.call(this._client, this.id);
    }

    /**
    * Get all invites in the club
    * @returns {Promise<Array<Invite>>}
    */
    getInvites() {
        return this._client.getClubInvites.call(this._client, this.id);
    }

    /**
    * Get the prune count for the club
    * @arg {Number} [options] The options to use to get number of prune members
    * @arg {Number} [options.days=7] The number of days of inactivity to prune for
    * @arg {Array<String>} [options.includeRoles] An array of role IDs that members must have to be considered for pruning
    * @returns {Promise<Number>} Resolves with the number of members that would be pruned
    */
    getPruneCount(options) {
        return this._client.getPruneCount.call(this._client, this.id, options);
    }

    /**
    * Get a club's channels via the REST API. REST mode is required to use this endpoint.
    * @returns {Promise<(CategoryChannel[] | TextChannel[] | VoiceChannel[])>}
    */
    getRESTChannels() {
        return this._client.getRESTClubChannels.call(this._client, this.id);
    }

    /**
    * Get a club emoji via the REST API. REST mode is required to use this endpoint.
    * @arg {String} emojiID The ID of the emoji
    * @returns {Promise<Object>} An emoji object
    */
    getRESTEmoji(emojiID) {
        return this._client.getRESTClubEmoji.call(this._client, this.id, emojiID);
    }

    /**
    * Get a club's emojis via the REST API. REST mode is required to use this endpoint.
    * @returns {Promise<Array<Object>>} An array of club emoji objects
    */
    getRESTEmojis() {
        return this._client.getRESTClubEmojis.call(this._client, this.id);
    }

    /**
    * Get a club's members via the REST API. REST mode is required to use this endpoint.
    * @arg {String} memberID The ID of the member
    * @returns {Promise<Member>}
    */
    getRESTMember(memberID) {
        return this._client.getRESTClubMember.call(this._client, this.id, memberID);
    }

    /**
    * Get a club's members via the REST API. REST mode is required to use this endpoint.
    * @arg {Number} [limit=1] The max number of members to get (1 to 1000)
    * @arg {String} [after] The highest user ID of the previous page
    * @returns {Promise<Array<Member>>}
    */
    getRESTMembers(limit, after) {
        return this._client.getRESTClubMembers.call(this._client, this.id, limit, after);
    }

    /**
    * Get a club's roles via the REST API. REST mode is required to use this endpoint.
    * @returns {Promise<Array<Role>>}
    */
    getRESTRoles() {
        return this._client.getRESTClubRoles.call(this._client, this.id);
    }

    /**
    * Returns the vanity url of the club
    * @returns {Promise}
    */
    getVanity() {
        return this._client.getClubVanity.call(this._client, this.id);
    }

    /**
    * Get possible voice regions for a club
    * @returns {Promise<Array<Object>>} Resolves with an array of voice region objects
    */
    getVoiceRegions() {
        return this._client.getVoiceRegions.call(this._client, this.id);
    }

    /**
    * Get all the webhooks in the club
    * @returns {Promise<Array<Object>>} Resolves with an array of webhook objects
    */
    getWebhooks() {
        return this._client.getClubWebhooks.call(this._client, this.id);
    }

    /**
    * Get a club's widget object
    * @returns {Promise<Object>} A club widget object
    */
    getWidget() {
        return this._client.getClubWidget.call(this._client, this.id);
    }

    /**
    * Kick a member from the club
    * @arg {String} userID The ID of the member
    * @arg {String} [reason] The reason to be displayed in audit logs
    * @returns {Promise}
    */
    kickMember(userID, reason) {
        return this._client.kickClubMember.call(this._client, this.id, userID, reason);
    }

    /**
    * Leave the club
    * @returns {Promise}
    */
    leave() {
        return this._client.leaveClub.call(this._client, this.id);
    }

    /**
    * Leaves the voice channel in this club
    */
    leaveVoiceChannel() {
        this._client.closeVoiceConnection.call(this._client, this.id);
    }

    /**
    * Get the club permissions of a member
    * @arg {String | Member} memberID The ID of the member or a Member instance
    * @returns {Permission}
    */
    permissionsOf(memberID) {
        const member = memberID instanceof Member ? memberID : this.members.get(memberID);
        if(member.id === this.ownerID) {
            return new Permission(Permissions.all);
        } else {
            let permissions = this.roles.get(this.id).permissions.allow;
            for(let role of member.roles) {
                role = this.roles.get(role);
                if(!role) {
                    continue;
                }

                const {allow: perm} = role.permissions;
                if(perm & Permissions.administrator) {
                    permissions = Permissions.all;
                    break;
                } else {
                    permissions |= perm;
                }
            }
            return new Permission(permissions);
        }
    }

    /**
    * Begin pruning the club
    * @arg {Number} [options] The options to pass to prune members
    * @arg {Boolean} [options.computePruneCount=true] Whether or not the number of pruned members should be returned. Helselia discourages setting this to true for larger clubs
    * @arg {Number} [options.days=7] The number of days of inactivity to prune for
    * @arg {Array<String>} [options.includeRoles] An array of role IDs that members must have to be considered for pruning
    * @arg {String} [options.reason] The reason to be displayed in audit logs
    * @returns {Promise<Number>} Resolves with the number of pruned members
    */
    pruneMembers(options) {
        return this._client.pruneMembers.call(this._client, this.id, options);
    }

    /**
    * Remove a role from a club member
    * @arg {String} memberID The ID of the member
    * @arg {String} roleID The ID of the role
    * @arg {String} [reason] The reason to be displayed in audit logs
    * @returns {Promise}
    */
    removeMemberRole(memberID, roleID, reason) {
        return this._client.removeClubMemberRole.call(this._client, this.id, memberID, roleID, reason);
    }

    /**
    * Search for club members by partial nickname/username
    * @arg {String} query The query string to match username(s) and nickname(s) against
    * @arg {Number} [limit=1] The maximum number of members you want returned, capped at 100
    * @returns {Promise<Array<Member>>}
    */
    searchMembers(query, limit) {
        return this._client.searchClubMembers.call(this._client, this.id, query, limit);
    }

    /**
    * Force a club integration to sync
    * @arg {String} integrationID The ID of the integration
    * @returns {Promise}
    */
    syncIntegration(integrationID) {
        return this._client.syncClubIntegration.call(this._client, this.id, integrationID);
    }

    /**
    * Unban a user from the club
    * @arg {String} userID The ID of the member
    * @arg {String} [reason] The reason to be displayed in audit logs
    * @returns {Promise}
    */
    unbanMember(userID, reason) {
        return this._client.unbanClubMember.call(this._client, this.id, userID, reason);
    }

    toJSON(props = []) {
        return super.toJSON([
            "afkChannelID",
            "afkTimeout",
            "banner",
            "channels",
            "defaultNotifications",
            "description",
            "emojis",
            "explicitContentFilter",
            "features",
            "icon",
            "joinedAt",
            "large",
            "maxMembers",
            "maxPresences",
            "memberCount",
            "members",
            "mfaLevel",
            "name",
            "ownerID",
            "preferredLocale",
            "premiumSubscriptionCount",
            "premiumTier",
            "region",
            "roles",
            "splash",
            "unavailable",
            "vanityURL",
            "verificationLevel",
            ...props
        ]);
    }
}

module.exports = Club;
