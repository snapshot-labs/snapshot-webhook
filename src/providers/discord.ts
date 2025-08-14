import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
  EmbedBuilder,
  codeBlock,
  underscore,
  inlineCode,
  DiscordAPIError,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ComponentType,
  ColorResolvable,
  Options
} from 'discord.js';
import db from '../helpers/mysql';
import removeMd from 'remove-markdown';
import { shortenAddress, getSpace } from '../helpers/utils';
import { capture } from '@snapshot-labs/snapshot-sentry';
import { timeOutgoingRequest, outgoingMessages } from '../helpers/metrics';

const CLIENT_ID = process.env.DISCORD_CLIENT_ID || '';
const token = process.env.DISCORD_TOKEN || '';
const sweeperOption = { interval: 300, filter: () => null };
// const invite = 'https://discord.com/oauth2/authorize?client_id=892847850780762122&permissions=534723951680&scope=bot';

let subs = {};

const client: any = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages
  ],
  makeCache: Options.cacheWithLimits({
    MessageManager: 0,
    GuildMemberManager: 0,
    UserManager: 0
  }),
  // Remove cache for every 5 minutes to prevent memory leaks https://discord.js.org/#/docs/discord.js/stable/class/Sweepers?scrollTo=options
  sweepers: {
    messages: sweeperOption,
    reactions: sweeperOption,
    users: sweeperOption,
    applicationCommands: sweeperOption,
    bans: sweeperOption,
    emojis: sweeperOption,
    invites: sweeperOption,
    guildMembers: sweeperOption,
    presences: sweeperOption,
    stageInstances: sweeperOption,
    stickers: sweeperOption,
    threadMembers: sweeperOption,
    threads: sweeperOption,
    voiceStates: sweeperOption
  }
});

const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Make sure the bot is online.')
    .setDMPermission(false)
    .setDefaultMemberPermissions(0), // only administrator role
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('List all commands and current notifications.')
    .setDMPermission(false)
    .setDefaultMemberPermissions(0),
  new SlashCommandBuilder()
    .setName('add')
    .setDescription('Add notifications on a channel when a proposal start.')
    .setDMPermission(false)
    .setDefaultMemberPermissions(0)
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('Channel to post the events')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('space')
        .setDescription('space to subscribe to')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('mention').setDescription('Mention role')
    ),
  new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Remove notifications on a channel.')
    .setDMPermission(false)
    .setDefaultMemberPermissions(0)
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('Channel to post the events')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('space')
        .setDescription('space to subscribe to')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('select-events')
    .setDescription('Select events to subscribe.')
    .setDMPermission(false)
    .setDefaultMemberPermissions(0)
];

const rest = new REST({ version: '10' }).setToken(token);

const PROPOSAL_EVENTS = [
  {
    id: 'proposal/created',
    label: 'Proposal Created',
    status: 'Created',
    description: 'When a proposal is created.',
    color: '#C5C5C5'
  },
  {
    id: 'proposal/start',
    label: 'Proposal Start',
    status: 'Started',
    description: 'When a proposal starts.',
    color: '#21B66F'
  },
  {
    id: 'proposal/end',
    label: 'Proposal End',
    status: 'Closed',
    description: 'When a proposal ends.',
    color: '#BF40BF'
  },
  {
    id: 'proposal/deleted',
    label: 'Proposal Deleted',
    status: 'Deleted',
    description: 'When a proposal is deleted.',
    color: '#FF0000'
  }
];

(async () => {
  try {
    console.log('[discord] started refreshing application (/) commands.');
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('[discord] successfully reloaded application (/) commands.');
  } catch (error) {
    capture(error);
  }
})();

client.login(token);

export const setActivity = (message, url?) => {
  try {
    client.user.setActivity(message, { type: 'WATCHING', url });
    return true;
  } catch (e) {
    capture(e);
  }
};

const checkPermissions = async (channelId, botId) => {
  try {
    const discordChannel = await client.channels.fetch(channelId);
    if (!discordChannel.isTextBased()) return 'Channel is not text';

    const botMember = await discordChannel.guild.members.fetch(botId);
    if (
      !discordChannel
        .permissionsFor(botMember)
        ?.has(PermissionsBitField.Flags.ViewChannel)
    )
      return `I do not have permission to view this channel ${discordChannel.toString()}, Add me to the channel and try again`;
    if (
      !discordChannel
        .permissionsFor(botMember)
        ?.has(PermissionsBitField.Flags.SendMessages)
    )
      return `I do not have permission to send messages in this channel ${discordChannel.toString()}, Add permission and try again`;
    return true;
  } catch (error) {
    if (!(error instanceof DiscordAPIError)) {
      capture(error);
    }
    console.error('[discord] error checking permissions', error);
    const channelExistWithName = client.channels.cache.find(
      c => c.name === channelId
    );
    if (channelExistWithName) {
      return `Make sure the channel is in ${channelExistWithName.toString()} format.`;
    } else {
      return `Can't find the channel ${channelId}, please try again.`;
    }
  }
};

client.on('ready', async () => {
  console.log(`[discord] bot logged as "${client.user.tag}"`);
  setActivity('!');

  await loadSubscriptions();
});

async function getEventsConfigured(guildId: string): Promise<string[] | null> {
  const events = await db.queryAsync(
    'SELECT events FROM subscriptions WHERE guild = ?',
    guildId
  );
  if (events.length === 0) return null;
  return JSON.parse(events[0].events);
}

async function snapshotSelectEventsCommandHandler(interaction) {
  const guildEvents = await getEventsConfigured(interaction.guildId);
  if (!guildEvents)
    return interaction
      .reply({
        content: `No subscriptions found on this server. Please add a subscription first.`,
        ephemeral: true
      })
      .catch(capture);

  const select = new StringSelectMenuBuilder()
    .setCustomId('selectedEvents')
    .setPlaceholder('Make a selection!')
    .addOptions(
      PROPOSAL_EVENTS.map(event =>
        new StringSelectMenuOptionBuilder()
          .setLabel(event.label)
          .setDescription(event.description)
          .setValue(event.id)
          .setDefault(guildEvents.includes(event.id))
      )
    )
    .setMinValues(1)
    .setMaxValues(PROPOSAL_EVENTS.length);

  const row = new ActionRowBuilder().addComponents(select);

  const response = await interaction
    .reply({
      content: 'Select events to subscribe.',
      components: [row],
      ephemeral: true
    })
    .catch(capture);

  const collector = response.createMessageComponentCollector({
    componentType: ComponentType.StringSelect,
    time: 3_600_000
  });

  collector.on('collect', async i => {
    const selection = i.values;
    try {
      const response = await db.queryAsync(
        `UPDATE subscriptions SET events = ? WHERE guild = ?`,
        [JSON.stringify(selection), i.guildId]
      );
      if (response.affectedRows === 0) {
        return i.update({
          content: `No subscriptions found on this server. Please add a subscription first.`,
          components: [],
          ephemeral: true
        });
      }
      await loadSubscriptions();
    } catch (e) {
      capture(e);
    }
    await i
      .update({
        content: `Success! You will be notified for events ${selection
          .map(a => `\`${a}\``)
          .join(', ')}`,
        components: [],
        ephemeral: true
      })
      .catch(capture);
  });
}

async function snapshotHelpCommandHandler(interaction) {
  const subscriptions = await db.queryAsync(
    'SELECT * FROM subscriptions WHERE guild = ?',
    interaction.guildId
  );
  let subscriptionsDescription = `\n\n**Subscriptions (${subscriptions.length})**\n\n`;
  const events = JSON.parse(subscriptions[0]?.events || `["proposal/start"]`);
  if (subscriptions.length > 0) {
    subscriptions.forEach(subscription => {
      subscriptionsDescription += `<#${subscription.channel}> ${subscription.space}\n`;
    });
  } else {
    subscriptionsDescription += 'No subscriptions\n';
  }

  subscriptionsDescription += `\n\n**Configured Events**
  ${events
    .map(
      (e: any) => `\`${PROPOSAL_EVENTS.find((p: any) => p.id === e)?.label}\``
    )
    .join('\n ')}
  `;
  subscriptionsDescription += `\n**Commands**`;

  const addSubscriptionExample = codeBlock(
    `/add channel:#snapshot space:yam.eth mention:@everyone`
  );

  const removeSubscriptionExample = codeBlock(
    `/remove channel:#snapshot space:yam.eth`
  );

  const embed = new EmbedBuilder()
    .setColor(0x0099ff)
    .setTitle(underscore('Snapshot bot'))
    .setDescription(subscriptionsDescription || ' ')
    .setThumbnail(
      'https://github.com/snapshot-labs/brand/blob/master/icon/icon.png?raw=true'
    )
    .addFields(
      {
        name: '`/ping` - Make sure the bot is online.',
        value: '----------------------------------------------------'
      },
      {
        name: '`/help` - List all commands and current notifications.',
        value: '----------------------------------------------------'
      },
      {
        name: '`/add` - Add notifications on a channel',
        value: `
        Options:
        **channel**: Channel to post the events
        **space**: Space id to subscribe to
        **mention**: Mention role (optional)

        Example:
        ${addSubscriptionExample}
        ----------------------------------------------------`
      },
      {
        name: '`/remove` - Remove notifications on a channel.',
        value: `
        Options:
        **channel**: Channel to post the events
        **space**: Space id to subscribe to

        Example:
        ${removeSubscriptionExample}
        ----------------------------------------------------`
      },
      {
        name: '`/select-events ` - Select events for your notifications.',
        value: `
        Options:
        ${PROPOSAL_EVENTS.map(e => `**${e.label}**`).join('\n')}

        ----------------------------------------------------


        Have any questions? Join our discord: https://discord.snapshot.org`
      }
    );
  interaction.reply({ embeds: [embed], ephemeral: true }).catch(capture);
}

async function snapshotCommandHandler(interaction, commandType) {
  const ts = parseInt((Date.now() / 1e3).toFixed());
  const { id: channelId } = interaction.options.getChannel('channel');
  const spaceId = interaction.options.getString('space');
  const mention = interaction.options.getString('mention');
  console.log(
    '[discord] received',
    interaction.guildId,
    interaction.user.username,
    ':',
    commandType,
    channelId,
    spaceId,
    mention
  );
  if (commandType === 'add') {
    const permissions = await checkPermissions(channelId, CLIENT_ID);
    if (permissions !== true)
      return interaction.reply(permissions).catch(capture);

    const space = await getSpace(spaceId);
    if (!space)
      return interaction.reply(`Space not found: ${inlineCode(spaceId)}`);

    const events = await getEventsConfigured(interaction.guildId);

    const subscription = [
      interaction.guildId,
      channelId,
      spaceId,
      mention || '',
      ts,
      events ? JSON.stringify(events) : '["proposal/start"]',
      ts
    ];
    await db.queryAsync(
      `INSERT INTO subscriptions (guild, channel, space, mention, updated, events, created) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE guild = ?, channel = ?, space = ?, mention = ?, updated = ?`,
      [...subscription, ...subscription]
    );
    await loadSubscriptions();
    const color = '#21B66F';
    const embed = new EmbedBuilder()
      .setColor(color)
      .addFields(
        { name: 'Space', value: spaceId, inline: true },
        { name: 'Channel', value: `<#${channelId}>`, inline: true },
        { name: 'Mention', value: mention || 'None', inline: true }
      )
      .setDescription(
        'You have successfully subscribed to proposal events of this space.'
      );
    interaction.reply({ embeds: [embed], ephemeral: true }).catch(capture);
  } else if (commandType === 'remove') {
    const query = `DELETE FROM subscriptions WHERE guild = ? AND channel = ? AND space = ?`;
    await db.queryAsync(query, [interaction.guildId, channelId, spaceId]);
    await loadSubscriptions();
    const color = '#EE4145';
    const embed = new EmbedBuilder()
      .setColor(color)
      .addFields(
        { name: 'Space', value: spaceId, inline: true },
        { name: 'Channel', value: `<#${channelId}>`, inline: true }
      )
      .setDescription('You have successfully unsubscribed to space events.');
    interaction.reply({ embeds: [embed], ephemeral: true }).catch(capture);
  }
}

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'ping') {
    await interaction.reply({
      content: `Pong! Websocket heartbeat: ${client.ws.ping}ms.`,
      ephemeral: true
    });
  } else if (interaction.commandName === 'help') {
    snapshotHelpCommandHandler(interaction);
  } else if (interaction.commandName === 'add') {
    snapshotCommandHandler(interaction, 'add');
  } else if (interaction.commandName === 'remove') {
    snapshotCommandHandler(interaction, 'remove');
  } else if (interaction.commandName === 'select-events') {
    snapshotSelectEventsCommandHandler(interaction);
  }
});

export const sendMessage = async (channel, message) => {
  const end = timeOutgoingRequest.startTimer({ provider: 'discord' });
  let success = false;

  try {
    let speaker = client.channels.cache.get(channel);
    // Obtains a channel from Discord, or the channel cache if it's already available.
    if (!speaker) speaker = await client.channels.fetch(channel);
    await speaker.send(message);
    success = true;
    return true;
  } catch (error) {
    if (!(error instanceof DiscordAPIError)) {
      capture(error);
    }
    console.error('[discord] Failed to send message', channel, error);
  } finally {
    outgoingMessages.inc({ provider: 'discord', status: success ? 1 : 0 });
    end({ status: success ? 200 : 500 });
  }
};

const sendToSubscribers = (event, proposal, embed, components) => {
  if (subs[proposal.space.id] || subs['*']) {
    [...(subs['*'] || []), ...(subs[proposal.space.id] || [])].forEach(sub => {
      if (sub.events && !JSON.parse(sub.events).includes(event)) return;
      sendMessage(sub.channel, {
        content: `${sub.mention}`,
        embeds: [embed],
        components
      });
    });
  }
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function send(eventObj, proposal, _subscribers) {
  const event = eventObj.event;
  const proposalEvent = PROPOSAL_EVENTS.find(e => e.id === event)!;
  const color = proposalEvent.color;
  const status = proposalEvent.status;
  const avatar = `https://cdn.stamp.fyi/space/${proposal.space.id}?s=56`;
  try {
    if (event === 'proposal/deleted') {
      const embed = new EmbedBuilder()
        .setAuthor({
          name: `${proposal.space.id}`,
          iconURL: avatar
        })
        .setColor(color as ColorResolvable)
        .addFields(
          {
            name: 'Proposal ID',
            value: `\`${proposal.id}\``,
            inline: true
          },
          { name: 'Status', value: status, inline: true }
        )
        .addFields();
      sendToSubscribers(event, proposal, embed, []);
      return { success: true };
    }

    const url = `https://snapshot.box/#/s:${proposal.space.id}/proposal/${proposal.id}`;

    let components =
      !proposal.choices.length || proposal.choices.length > 5
        ? []
        : [
            new ActionRowBuilder().addComponents(
              ...proposal.choices.map((choice, i) =>
                new ButtonBuilder()
                  .setLabel(choice.slice(0, 79))
                  .setURL(`${url}?choice=${i + 1}`)
                  .setStyle(ButtonStyle.Link)
              )
            )
          ];
    components =
      event === 'proposal/start' &&
      (proposal.type === 'single-choice' || proposal.type === 'basic')
        ? components
        : [];

    const limit = 4096 / 16;
    let preview = removeMd(proposal.body).slice(0, limit);
    if (proposal.body.length > limit) preview += `... [Read more](${url})`;

    const embed = new EmbedBuilder()
      .setColor(color as ColorResolvable)
      .setTitle(proposal.title)
      .setURL(url)
      .setTimestamp(proposal.created * 1e3)
      .setAuthor({
        name: `${proposal.space.name} by ${shortenAddress(proposal.author)}`,
        iconURL: avatar
      })
      .addFields(
        { name: 'Status', value: status, inline: true },
        { name: 'Start', value: `<t:${proposal.start}:R>`, inline: true },
        { name: 'End', value: `<t:${proposal.end}:R>`, inline: true }
      )
      .setDescription(preview || ' ');

    sendToSubscribers(event, proposal, embed, components);

    return { success: true };
  } catch (e: any) {
    capture(e, { proposal, event });
    return { success: false };
  }
}

async function loadSubscriptions() {
  const results = await db.queryAsync('SELECT * FROM subscriptions');
  subs = {};
  results.forEach(sub => {
    if (!subs[sub.space]) subs[sub.space] = [];
    subs[sub.space].push(sub);
  });
  console.log('[discord] subscriptions', Object.keys(subs).length);
}

export default client;
