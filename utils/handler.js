const { Events, MessageFlags, ActivityType } = require('discord.js')
const { handleTicketButton } = require('../ticket/ticket-handler')
const { handleRoleButton } = require('../handlers/react-role')

async function replyError(interaction, error) {
    console.error(error)
    const payload = { content: 'Error!', flags: [MessageFlags.Ephemeral] }
    if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload).catch(() => {})
    } else {
        await interaction.reply(payload).catch(() => {})
    }
}

function handler(client) {
    client.once(Events.ClientReady, () => {
        console.log(`login as ${client.user.tag}`);
        // startBloodAnnouncerIfConfigured(client)

        client.user.setPresence({
            activities: [{
                name: 'watching the leaderboard',
                type: ActivityType.Watching
            }],
            status: 'idle',
        })
    })

    client.on(Events.InteractionCreate, async (interaction) => {
        try {
            // slash command (/ping, /setup-ticket, dst)
            if (interaction.isChatInputCommand()) {
                const command = client.commands.get(interaction.commandName)
                if (!command) {
                    return interaction.reply({
                        content: 'Unknown command, try re-deploying.',
                        flags: MessageFlags.Ephemeral,
                    })
                }
                return await command.execute(interaction)
            }

            // button (ticket + react role)
            if (interaction.isButton()) {
                const id = interaction.customId
                if (id.startsWith('ticket_')) return await handleTicketButton(interaction)
                if (id.startsWith('rr:')) return await handleRoleButton(interaction)
            }
        } catch (error) {
            await replyError(interaction, error)
        }
    })

    client.on(Events.MessageReactionAdd, async (reaction, user) => {
        try {
            if (user.bot) return
            if (reaction.partial) reaction = await reaction.fetch().catch(() => null)
            if (!reaction) return

            const emoji = reaction.emoji.name?.toLowerCase()
            if (emoji !== 'y' && emoji !== 'n') return
            if (!reaction.message.author?.bot) return
            if (!reaction.message.embeds?.[0]) return
            const title = reaction.message.embeds[0].title ?? ''
            if (!title.startsWith('Close ticket?')) return

            const [, ownerId, staffRoles, logChannelId] = reaction.message.channel.topic.split(':')
            const staffRoleIds = staffRoles.split(',')
            const member = await reaction.message.guild.members.fetch(user.id)
            const isOwner = user.id === ownerId
            const isStaff = member.roles.cache.some(r => staffRoleIds.includes(r.id))
            if (!isOwner && !isStaff) {
                await reaction.users.remove(user.id).catch(() => {})
                return
            }

            const wantTranscript = emoji === 'y'
            require('../ticket/ticket-handler')
                .finishClose(reaction.message.channel, {
                    ownerId, staffRoleIds, logChannelId, wantTranscript, closedBy: user
                })
        } catch (error) {
            console.error(error)
        }
    })
}

// function startBloodAnnouncerIfConfigured(client) {
//     const base = process.env.CTFD_URL
//     const token = process.env.CTFD_TOKEN
//     const channelId = process.env.BLOOD_CHANNEL_ID
//     if (!base || !channelId) {
//         console.log('[blood] CTFD_URL / BLOOD_CHANNEL_ID not set, announcer off')
//         return
//     }
//     const { startBloodAnnouncer } = require('./blood-announcer')
//     startBloodAnnouncer(client, { baseUrl: base, apiToken: token, channelId })
// }

module.exports = handler
