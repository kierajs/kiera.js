"use strict";

const Base = require("./Base");
const User = require("./User");
const VoiceState = require("./VoiceState");

/**
* Represents a server member
* @prop {Array<Object>?} activities The member's current activities
* @prop {String?} avatar The hash of the user's avatar, or null if no avatar
* @prop {String} avatarURL The URL of the user's avatar which can be either a JPG or GIF
* @prop {Boolean} bot Whether the user is an OAuth bot or not
* @prop {Object?} clientStatus The member's per-client status
* @prop {String} clientStatus.web The member's status on web. Either "online", "idle", "dnd", or "offline". Will be "online" for bots
* @prop {String} clientStatus.desktop The member's status on desktop. Either "online", "idle", "dnd", or "offline". Will be "offline" for bots
* @prop {String} clientStatus.mobile The member's status on mobile. Either "online", "idle", "dnd", or "offline". Will be "offline" for bots
* @prop {Number} createdAt Timestamp of user creation
* @prop {String} defaultAvatar The hash for the default avatar of a user if there is no avatar set
* @prop {String} defaultAvatarURL The URL of the user's default avatar
* @prop {String} discriminator The discriminator of the user
* @prop {Object?} game The active game the member is playing
* @prop {String} game.name The name of the active game
* @prop {Number} game.type The type of the active game (0 is default, 1 is Twitch, 2 is YouTube)
* @prop {String?} game.url The url of the active game
* @prop {Club} club The club the member is in
* @prop {String} id The ID of the member
* @prop {Number} joinedAt Timestamp of when the member joined the club
* @prop {String} mention A string that mentions the member
* @prop {String?} nick The server nickname of the member
* @prop {Permission} permission [DEPRECATED] The club-wide permissions of the member. Use Member#permissions instead
* @prop {Permission} permissions The club-wide permissions of the member
* @prop {Number} premiumSince Timestamp of when the member boosted the club
* @prop {Array<String>} roles An array of role IDs this member is a part of
* @prop {String} staticAvatarURL The URL of the user's avatar (always a JPG)
* @prop {String} status The member's status. Either "online", "idle", "dnd", or "offline"
* @prop {User} user The user object of the member
* @prop {String} username The username of the user
* @prop {VoiceState} voiceState The voice state of the member
*/
class Member extends Base {
    constructor(data, club, client) {
        super(data.id || data.user.id);
        if(!data.id && data.user) {
            data.id = data.user.id;
        }
        if((this.club = club)) {
            this.user = club.shard.client.users.get(data.id);
            if(!this.user && data.user) {
                this.user = club.shard.client.users.add(data.user, club.shard.client);
            }
            if(!this.user) {
                throw new Error("User associated with Member not found: " + data.id);
            }
        } else if(data.user) {
            this.user = new User(data.user, client);
        } else {
            this.user = null;
        }

        this.game = null;
        this.nick = null;
        this.roles = [];
        this.update(data);
    }

    update(data) {
        if(data.status !== undefined) {
            this.status = data.status;
        }
        if(data.game !== undefined) {
            this.game = data.game;
        }
        if(data.joined_at !== undefined) {
            this.joinedAt = Date.parse(data.joined_at);
        }
        if(data.client_status !== undefined) {
            this.clientStatus = Object.assign({web: "offline", desktop: "offline", mobile: "offline"}, data.client_status);
        }
        if(data.activities !== undefined) {
            this.activities = data.activities;
        }
        if(data.premium_since !== undefined) {
            this.premiumSince = data.premium_since;
        }
        if(data.hasOwnProperty("mute") && this.club) {
            const state = this.club.voiceStates.get(this.id);
            if(data.channel_id === null && !data.mute && !data.deaf && !data.suppress) {
                this.club.voiceStates.delete(this.id);
            } else if(state) {
                state.update(data);
            } else if(data.channel_id || data.mute || data.deaf || data.suppress) {
                this.club.voiceStates.update(data);
            }
        }
        if(data.nick !== undefined) {
            this.nick = data.nick;
        }
        if(data.roles !== undefined) {
            this.roles = data.roles;
        }
    }

    get avatar() {
        return this.user.avatar;
    }

    get avatarURL() {
        return this.user.avatarURL;
    }

    get bot() {
        return this.user.bot;
    }

    get createdAt() {
        return this.user.createdAt;
    }

    get defaultAvatar() {
        return this.user.defaultAvatar;
    }

    get defaultAvatarURL() {
        return this.user.defaultAvatarURL;
    }

    get discriminator() {
        return this.user.discriminator;
    }

    get mention() {
        return `<@!${this.id}>`;
    }

    get permission() {
        this.club.shard.client.emit("warn", "[DEPRECATED] Member#permission is deprecated. Use Member#permissions instead");
        return this.permissions;
    }

    get permissions() {
        return this.club.permissionsOf(this);
    }

    get staticAvatarURL(){
        return this.user.staticAvatarURL;
    }

    get username() {
        return this.user.username;
    }

    get voiceState() {
        if(this.club && this.club.voiceStates.has(this.id)) {
            return this.club.voiceStates.get(this.id);
        } else {
            return new VoiceState({
                id: this.id
            });
        }
    }

    /**
    * Add a role to the club member
    * @arg {String} roleID The ID of the role
    * @arg {String} [reason] The reason to be displayed in audit logs
    * @returns {Promise}
    */
    addRole(roleID, reason) {
        return this.club.shard.client.addClubMemberRole.call(this.club.shard.client, this.club.id, this.id, roleID, reason);
    }

    /**
    * Ban the user from the club
    * @arg {Number} [deleteMessageDays=0] Number of days to delete messages for
    * @arg {String} [reason] The reason to be displayed in audit logs
    * @returns {Promise}
    */
    ban(deleteMessageDays, reason) {
        return this.club.shard.client.banClubMember.call(this.club.shard.client, this.club.id, this.id, deleteMessageDays, reason);
    }

    /**
    * Edit the club member
    * @arg {Object} options The properties to edit
    * @arg {String} [options.channelID] The ID of the voice channel to move the user to (must be in voice)
    * @arg {Boolean} [options.deaf] Server deafen the user
    * @arg {Boolean} [options.mute] Server mute the user
    * @arg {String} [options.nick] Set the user's server nickname, "" to remove
    * @arg {Array<String>} [options.roles] The array of role IDs the user should have
    * @arg {String} [reason] The reason to be displayed in audit logs
    * @returns {Promise}
    */
    edit(options, reason) {
        return this.club.shard.client.editClubMember.call(this.club.shard.client, this.club.id, this.id, options, reason);
    }

    /**
    * Kick the member from the club
    * @arg {String} [reason] The reason to be displayed in audit logs
    * @returns {Promise}
    */
    kick(reason) {
        return this.club.shard.client.kickClubMember.call(this.club.shard.client, this.club.id, this.id, reason);
    }

    /**
    * Remove a role from the club member
    * @arg {String} roleID The ID of the role
    * @arg {String} [reason] The reason to be displayed in audit logs
    * @returns {Promise}
    */
    removeRole(roleID, reason) {
        return this.club.shard.client.removeClubMemberRole.call(this.club.shard.client, this.club.id, this.id, roleID, reason);
    }

    /**
    * Unban the user from the club
    * @arg {String} [reason] The reason to be displayed in audit logs
    * @returns {Promise}
    */
    unban(reason) {
        return this.club.shard.client.unbanClubMember.call(this.club.shard.client, this.club.id, this.id, reason);
    }

    toJSON(props = []) {
        return super.toJSON([
            "game",
            "joinedAt",
            "nick",
            "roles",
            "status",
            "user",
            "voiceState",
            "premiumSince",
            ...props
        ]);
    }
}

module.exports = Member;
