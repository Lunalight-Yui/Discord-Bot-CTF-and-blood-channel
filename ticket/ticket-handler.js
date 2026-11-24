const {
  ChannelType, PermissionFlagsBits, MessageFlags,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
} = require('discord.js')
const { createTranscript } = require('../utils/transcript')

async function handleTicketButton(interaction) {
  const [action, categoryId, logChannelId, staffRoles] = interaction.customId.split(':')
  if (action === 'ticket_open') return openTicket(interaction, categoryId, logChannelId, staffRoles)
  if (action === 'ticket_close') return askClose(interaction)
  if (action === 'ticket_close_yes') return doClose(interaction)
  if (action === 'ticket_close_no') return cancelClose(interaction)
  if (action === 'ticket_close_transcript') return doCloseWithTranscriptChoice(interaction, true)
  if (action === 'ticket_close_plain') return doCloseWithTranscriptChoice(interaction, false)
  if (action === 'ticket_delete') return deleteTicket(interaction)
}

// ---------- helpers ----------

function ticketInfo(channel) {
  if (!channel.topic?.startsWith('ticket:')) return null
  const [, ownerId, staffRoles, logChannelId] = channel.topic.split(':')
  const staffRoleIds = (staffRoles ?? '').split(',').filter(Boolean)
  return { ownerId, staffRoleIds, logChannelId }
}

// info for a channel that is either open (ticket:) or already closed (closed:)
function anyTicketInfo(channel) {
  if (!channel.topic) return null
  if (!channel.topic.startsWith('ticket:') && !channel.topic.startsWith('closed:')) return null
  const [, ownerId, staffRoles, logChannelId] = channel.topic.split(':')
  const staffRoleIds = (staffRoles ?? '').split(',').filter(Boolean)
  return { ownerId, staffRoleIds, logChannelId }
}

// allowed to close: Administrator, ManageChannels, ManageMessages, owner, or staff
function canManage(interaction, info) {
  const member = interaction.member
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true
  if (member.permissions.has(PermissionFlagsBits.ManageChannels)) return true
  if (member.permissions.has(PermissionFlagsBits.ManageMessages)) return true
  if (interaction.user.id === info.ownerId) return true
  if (member.roles.cache.some(r => info.staffRoleIds.includes(r.id))) return true
  return false
}

// creates the transcript and sends it to the log channel.
// returns true if it was really sent, false otherwise.
async function sendTranscript(channel, { ownerId, logChannelId, closedBy }) {
  const logChannel = logChannelId
    ? await channel.guild.channels.fetch(logChannelId).catch(() => null)
    : null
  if (!logChannel) return false

  // createTranscript returns ONE AttachmentBuilder (not an object)
  const transcriptFile = await createTranscript(channel)

  await logChannel.send({
    content: `Transcript of \`${channel.name}\` (owner: <@${ownerId}>, closed by ${closedBy}).`,
    files: [transcriptFile],
    allowedMentions: { parse: [] },
  })
  return true
}

// ---------- open ----------

async function openTicket(interaction, categoryId, logChannelId, staffRoles) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral })
  const { guild, user } = interaction

  const category = guild.channels.cache.get(categoryId)
  if (!category || category.type !== ChannelType.GuildCategory) {
    return interaction.editReply('Ticket category not found. Please contact an admin.')
  }

  const staffRoleIds = (staffRoles ?? '').split(',').filter(id => id && guild.roles.cache.has(id))
  if (!staffRoleIds.length) {
    return interaction.editReply('No valid staff roles configured. Please contact an admin.')
  }

  const existing = guild.channels.cache.find(
    c => c.parentId === categoryId && c.topic?.startsWith(`ticket:${user.id}:`),
  )
  if (existing) return interaction.editReply(`Here is your ticket: ${existing}`)

  if (category.children.cache.size >= 50) {
    return interaction.editReply('This category is full, please contact an admin.')
  }

  let permissionSnapshot
  try {
    const botMember = guild.members.me ?? await guild.members.fetchMe()
    const botPermissions = category.permissionsFor(botMember)
    const permissionOverwrites = [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
        ],
      },
      ...staffRoleIds.map(id => ({
        id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      })),
      {
        id: interaction.client.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageChannels,
        ],
      },
    ]
    const permissionLabels = new Map(
      Object.entries(PermissionFlagsBits).map(([name, permission]) => [
        permission,
        name.replace(/([a-z0-9])([A-Z])/g, '$1 $2'),
      ]),
    )
    permissionLabels.set(PermissionFlagsBits.ManageRoles, 'Manage Roles (Manage Permissions)')

    const requiredPermissionBits = new Set([
      PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.ManageRoles,
      ...permissionOverwrites.flatMap(overwrite => [
        ...(overwrite.allow ?? []),
        ...(overwrite.deny ?? []),
      ]),
    ])
    const requiredBotPermissions = [...requiredPermissionBits].map(permission => [
      permissionLabels.get(permission) ?? String(permission),
      permission,
    ])
    permissionSnapshot = Object.fromEntries(
      requiredBotPermissions.map(([name, permission]) => [name, botPermissions?.has(permission) ?? false]),
    )
    const missingPermissions = requiredBotPermissions
      .filter(([, permission]) => !botPermissions?.has(permission))
      .map(([name]) => name)

    if (missingPermissions.length) {
      console.error(
        `[ticket] Bot is missing ${missingPermissions.join(', ')} in category ${category.id}.`,
      )
      return interaction.editReply(
        `Cannot create a ticket: the bot is missing these permissions in the ticket category: ${missingPermissions.join(', ')}.`,
      )
    }

    const channel = await guild.channels.create({
      name: `ticket-${user.username}`.slice(0, 100),
      type: ChannelType.GuildText,
      parent: categoryId,
      topic: `ticket:${user.id}:${staffRoleIds.join(',')}:${logChannelId}`,
      permissionOverwrites,
      reason: `Ticket by ${user.tag}`,
    })

    const embed = new EmbedBuilder()
      .setTitle('Ticket opened')
      .setDescription(
        `Hello ${user}, please describe your problem. Staff will help you shortly.\n\n` +
        '*This conversation may be saved as a transcript when the ticket is closed.*',
      )
      .setColor(0x5865f2)

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_close')
        .setLabel('Close Ticket')
        .setStyle(ButtonStyle.Danger),
    )

    await channel.send({
      content: `${user}`,
      embeds: [embed],
      components: [row],
      allowedMentions: { users: [user.id], roles: staffRoleIds },
    })

    await interaction.editReply(`Ticket created: ${channel}`)
  } catch (err) {
    console.error('[ticket] Failed to create ticket channel:', err)
    if (err.code === 50013) {
      console.error('[ticket] Permission snapshot:', {
        guildId: guild.id,
        categoryId: category.id,
        botId: guild.members.me?.id,
        staffRoleIds,
        permissions: permissionSnapshot,
      })
    }
    const missingPermissions = permissionSnapshot
      ? Object.entries(permissionSnapshot)
        .filter(([, hasPermission]) => !hasPermission)
        .map(([name]) => name)
      : null
    let errorMessage = 'Cannot create a ticket in that category. Check the bot permissions and try again.'
    if (err.code === 50013) {
      if (missingPermissions === null) {
        errorMessage = 'Discord denied ticket creation (50013), and the bot permission check could not complete. Check the console log.'
      } else if (missingPermissions.length) {
        errorMessage = `Discord denied ticket creation (50013). Missing bot permissions: ${missingPermissions.join(', ')}.`
      } else {
        errorMessage = 'Discord denied ticket creation (50013), but no permissions used by the ticket overwrites are missing. Check the console snapshot for a guild-specific restriction.'
      }
    }
    await interaction.editReply(errorMessage)
  }
}

// ---------- close: step 1 (yes / no confirmation) ----------

async function askClose(interaction) {
  const channel = interaction.channel
  const info = ticketInfo(channel)
  if (!info) {
    return interaction.reply({ content: 'This is not an active ticket channel.', flags: MessageFlags.Ephemeral })
  }

  if (!canManage(interaction, info)) {
    return interaction.reply({ content: 'You cannot close this ticket.', flags: MessageFlags.Ephemeral })
  }

  const embed = new EmbedBuilder()
    .setTitle('Close this ticket?')
    .setDescription('Yes to close, no to keep it open.')
    .setColor(0xffa500)

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_close_yes')
      .setLabel('Yes')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('ticket_close_no')
      .setLabel('No')
      .setStyle(ButtonStyle.Secondary),
  )

  return interaction.reply({ embeds: [embed], components: [row] })
}

async function cancelClose(interaction) {
  const info = ticketInfo(interaction.channel)
  if (!info) {
    return interaction.reply({ content: 'This is not an active ticket channel.', flags: MessageFlags.Ephemeral })
  }
  if (!canManage(interaction, info)) {
    return interaction.reply({ content: 'You cannot close this ticket.', flags: MessageFlags.Ephemeral })
  }
  return interaction.update({ content: 'Ticket is still open.', embeds: [], components: [] })
}

// ---------- close: step 2 (ticket closed, owner lost access) ----------
// after closing, only staff + admin can see this channel (owner is denied)

async function doClose(interaction) {
  const channel = interaction.channel
  const info = ticketInfo(channel)
  if (!info) {
    return interaction.reply({ content: 'This is not an active ticket channel.', flags: MessageFlags.Ephemeral })
  }

  if (!canManage(interaction, info)) {
    return interaction.reply({ content: 'You cannot close this ticket.', flags: MessageFlags.Ephemeral })
  }

  await interaction.deferUpdate()

  await finishClose(channel, {
    ownerId: info.ownerId,
    staffRoleIds: info.staffRoleIds,
    logChannelId: info.logChannelId,
    closedBy: interaction.user,
    wantTranscript: false, // transcript is asked in step 3
  })

  const embed = new EmbedBuilder()
    .setTitle('Ticket closed')
    .setDescription(
      `Ticket closed by ${interaction.user}. The owner can no longer see this channel.\n\n` +
      'Create a transcript of this conversation?',
    )
    .setColor(0x5865f2)

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_close_transcript')
      .setLabel('Yes, create transcript & send to log channel')
      .setEmoji('📄')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('ticket_close_plain')
      .setLabel('No, skip')
      .setStyle(ButtonStyle.Secondary),
  )

  return interaction.editReply({ embeds: [embed], components: [row] })
}

// ---------- step 3: transcript or skip ----------
async function doCloseWithTranscriptChoice(interaction, wantTranscript) {
  const channel = interaction.channel
  const info = anyTicketInfo(channel)
  if (!info) {
    return interaction.reply({ content: 'This is not a ticket channel.', flags: MessageFlags.Ephemeral })
  }

  // staff/admin only
  const member = interaction.member
  if (!member.permissions.has(PermissionFlagsBits.ManageMessages) &&
      !member.roles.cache.some(r => info.staffRoleIds.includes(r.id)) &&
      !member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: 'Staff only.', flags: MessageFlags.Ephemeral })
  }

  await interaction.deferUpdate()

  if (wantTranscript) {
    try {
      const sent = await sendTranscript(channel, {
        ownerId: info.ownerId,
        logChannelId: info.logChannelId,
        closedBy: interaction.user,
      })

      // log channel not found -> DON'T delete, otherwise the transcript is lost forever
      if (!sent) {
        return interaction.editReply({
          content: 'Log channel not found, transcript was NOT sent. Channel is kept.',
          embeds: [],
          components: [],
        })
      }

      await interaction.editReply({
        content: 'Transcript sent. Deleting this channel in 5 seconds...',
        embeds: [],
        components: [],
      })
      // after transcript, auto-delete the channel
      setTimeout(
        () => channel.delete(`Deleted by ${interaction.user.tag} after transcript`).catch(console.error),
        5000,
      )
    } catch (err) {
      console.error('[transcript error]', err)
      await interaction.editReply({
        content: 'Failed to create/send transcript. Channel is kept.',
        embeds: [],
        components: [],
      })
    }
  } else {
    await interaction.editReply({
      content: 'Skipping transcript. Deleting this channel in 5 seconds...',
      embeds: [],
      components: [],
    })
    setTimeout(
      () => channel.delete(`Deleted by ${interaction.user.tag}`).catch(console.error),
      5000,
    )
  }
}

// ---------- finishClose (also used by Y/N reactions) ----------

async function finishClose(channel, { ownerId, staffRoleIds, logChannelId, wantTranscript, closedBy }) {
  await channel.permissionOverwrites.edit(ownerId, { ViewChannel: false }).catch(() => {})
  await channel.edit({
    name: `closed-${channel.name.replace(/^ticket-/, '')}`.slice(0, 100),
    topic: `closed:${ownerId}:${staffRoleIds.join(',')}:${logChannelId}`,
    reason: `Closed by ${closedBy.tag}`,
  })

  if (wantTranscript) {
    try {
      const sent = await sendTranscript(channel, { ownerId, logChannelId, closedBy })
      if (!sent) console.error('[finishClose] log channel not found, transcript not sent')
    } catch (err) {
      console.error('[transcript error]', err)
    }
  }
}

// ---------- delete ----------

async function deleteTicket(interaction) {
  const { channel } = interaction

  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator) &&
      !interaction.member.permissions.has(PermissionFlagsBits.ManageChannels) &&
      !interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
    return interaction.reply({ content: 'Only staff can delete this channel.', flags: MessageFlags.Ephemeral })
  }

  await interaction.reply('Deleting this channel in 5 seconds...')
  setTimeout(
    () => channel.delete(`Deleted by ${interaction.user.tag}`).catch(console.error),
    5000,
  )
}

module.exports = { handleTicketButton, finishClose }