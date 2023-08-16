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
  inlineCode
} from 'discord.js';
import db from '../helpers/mysql';
import removeMd from 'remove-markdown';
import { shortenAddress } from '../helpers/utils';
import { getSpace } from '../helpers/utils';
import { capture } from '@snapshot-labs/snapshot-sentry';

const CLIENT_ID = process.env.DISCORD_CLIENT_ID || '';
const token = process.env.DISCORD_TOKEN || '';
const sweeperOption = { interval: 300, filter: () => null };
// const invite = 'https://discord.com/oauth2/authorize?client_id=892847850780762122&permissions=534723951680&scope=bot';

let subs = {};

const client: any = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages
  ],
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

export let ready = false;

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
      option.setName('channel').setDescription('Channel to post the events').setRequired(true)
    )
    .addStringOption(option =>
      option.setName('space').setDescription('space to subscribe to').setRequired(true)
    )
    .addStringOption(option => option.setName('mention').setDescription('Mention role')),
  new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Remove notifications on a channel.')
    .setDMPermission(false)
    .setDefaultMemberPermissions(0)
    .addChannelOption(option =>
      option.setName('channel').setDescription('Channel to post the events').setRequired(true)
    )
    .addStringOption(option =>
      option.setName('space').setDescription('space to subscribe to').setRequired(true)
    )
];

const rest = new REST({ version: '10' }).setToken(token);

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
    if (!discordChannel.permissionsFor(botId).has(PermissionsBitField.Flags.ViewChannel))
      return `I do not have permission to view this channel ${discordChannel.toString()}, Add me to the channel and try again`;
    if (!discordChannel.permissionsFor(botId).has(PermissionsBitField.Flags.SendMessages))
      return `I do not have permission to send messages in this channel ${discordChannel.toString()}, Add permission and try again`;

    return true;
  } catch (error) {
    capture(error);
    console.log('[discord] error checking permissions', error);
    const channelExistWithName = client.channels.cache.find(c => c.name === channelId);
    if (channelExistWithName) {
      return `Make sure the channel is in ${channelExistWithName.toString()} format.`;
    } else {
      return `Can't find the channel ${channelId}, please try again.`;
    }
  }
};

client.on('ready', async () => {
  ready = true;
  console.log(`[discord] bot logged as "${client.user.tag}"`);
  setActivity('!');

  await loadSubscriptions();
});

async function snapshotHelpCommandHandler(interaction) {
  const subscriptions = await db.queryAsync(
    'SELECT * FROM subscriptions WHERE guild = ?',
    interaction.guildId
  );
  let subscriptionsDescription = `\n\n**Subscriptions (${subscriptions.length})**\n\n`;
  if (subscriptions.length > 0) {
    subscriptions.forEach(subscription => {
      subscriptionsDescription += `<#${subscription.channel}> ${subscription.space}\n`;
    });
  } else {
    subscriptionsDescription += 'No subscriptions\n';
  }
  subscriptionsDescription += `\n**Commands**`;
  const addSubscriptionExample = codeBlock(
    `/add channel:#snapshot space:yam.eth mention:@everyone`
  );

  const removeSubscriptionExample = codeBlock(`/remove channel:#snapshot space:yam.eth`);

  const embed = new EmbedBuilder()
    .setColor(0x0099ff)
    .setTitle(underscore('Snapshot bot'))
    .setDescription(subscriptionsDescription || ' ')
    .setThumbnail('https://github.com/snapshot-labs/brand/blob/master/icon/icon.png?raw=true')
    .addFields(
      { name: '`/ping`', value: 'Description: Make sure the bot is online.' },
      {
        name: '`/help`',
        value: 'Description: List all commands and current notifications.'
      },
      {
        name: '`/add`',
        value: `Description: Add notifications on a channel when a proposal start.
        Options:
        *channel*: Channel to post the events
        *space*: Space id to subscribe to
        *mention*: Mention role (optional)
        Example:
        ${addSubscriptionExample}`
      },
      {
        name: '`/remove`',
        value: `Description: Remove notifications on a channel.
        Options:
        *channel*: Channel to post the events
        *space*: Space id to subscribe to
        Example:
        ${removeSubscriptionExample}


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
    if (permissions !== true) return interaction.reply(permissions).catch(capture);

    const space = await getSpace(spaceId);
    if (!space) return interaction.reply(`Space not found: ${inlineCode(spaceId)}`);

    const subscription = [interaction.guildId, channelId, spaceId, mention || '', ts, ts];
    await db.queryAsync(
      `INSERT INTO subscriptions (guild, channel, space, mention, created, updated) VALUES (?, ?, ?, ?, ?, ?)
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
      .setDescription('You have successfully subscribed to space events.');
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
  }
});

export const sendMessage = async (channel, message) => {
  try {
    let speaker = client.channels.cache.get(channel);
    // Obtains a channel from Discord, or the channel cache if it's already available.
    if (!speaker) speaker = await client.channels.fetch(channel);
    await speaker.send(message);
    return true;
  } catch (e) {
    capture(e);
  }
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function send(eventObj, proposal, _subscribers) {
  const event = eventObj.event;

  // Only supports proposal/start event
  if (event !== 'proposal/start') {
    console.log('[discord] Event not supported: ', event);
    return;
  }

  const status = 'Active';
  const color = '#21B66F';

  const url = `https://snapshot.org/#/${proposal.space.id}/proposal/${proposal.id}`;
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
    event === 'proposal/start' && (proposal.type === 'single-choice' || proposal.type === 'basic')
      ? components
      : [];

  const limit = 4096 / 16;
  let preview = removeMd(proposal.body).slice(0, limit);
  if (proposal.body.length > limit) preview += `... [Read more](${url})`;
  const avatar = `https://cdn.stamp.fyi/space/${proposal.space.id}?s=56`;

  const embed = new EmbedBuilder()
    .setColor(color)
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

  if (subs[proposal.space.id] || subs['*']) {
    [...(subs['*'] || []), ...(subs[proposal.space.id] || [])].forEach(sub => {
      sendMessage(sub.channel, {
        content: `${sub.mention} `,
        embeds: [embed],
        components
      });
    });
  }

  return { success: true };
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
