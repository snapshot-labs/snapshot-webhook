import { Client, Intents, MessageEmbed, Permissions } from 'discord.js';
import db from './mysql';
import { loadSubscriptions } from './subscriptions';

const token = process.env.DISCORD_TOKEN;
const sweeperOption = {
  interval: 300, // 5 minutes in seconds
  filter: () => null
};

const client: any = new Client({
  intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.DIRECT_MESSAGES],
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
// const invite = 'https://discord.com/oauth2/authorize?client_id=892847850780762122&permissions=534723951680&scope=bot';

client.login(token);

export const setActivity = (message, url?) => {
  try {
    client.user.setActivity(message, { type: 'WATCHING', url });
    return true;
  } catch (e) {
    console.log('Missing activity', e);
  }
};

const checkPermissions = async (channelId, me) => {
  try {
    const discordChannel = await client.channels.fetch(channelId);
    if (!discordChannel.isText()) return 'Channel is not text';
    if (!discordChannel.permissionsFor(me.user.id).has('VIEW_CHANNEL'))
      return 'I do not have permission to view this channel, Add me to the channel and try again';
    if (!discordChannel.permissionsFor(me.user.id).has('SEND_MESSAGES'))
      return 'I do not have permission to send messages in this channel, Add permission and try again';
    return true;
  } catch (error) {
    console.log('Error checking permissions', error);
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
  console.log(`Discord bot logged as "${client.user.tag}"`);
  setActivity('!');
  await loadSubscriptions();
});

client.on('messageCreate', async msg => {
  if (msg.author.bot) return;

  const guild = msg.guild.id;

  const ts = parseInt((Date.now() / 1e3).toFixed());
  const isAdmin = msg.member?.permissions?.has(Permissions.FLAGS.ADMINISTRATOR) || false;

  if (msg.content === '!ping') msg.reply('Pong?');

  if (isAdmin) {
    const [id, command, channel, space, mention] = msg.content.split(' ');
    if (id === '!snapshot') {
      console.log('Received', guild, msg.author.username, ':', msg.content);
      const channelId = (channel || '').replace('<#', '').replace('>', '');

      if (['add', 'update'].includes(command) && channel && space) {
        const permissions = await checkPermissions(channelId, msg.guild.me);
        if (permissions !== true) return msg.reply(permissions).catch(console.error);
        const subscription = [guild, channelId, space, mention || '', ts];
        await db.queryAsync(
          `INSERT INTO subscriptions (guild, channel, space, mention, created) VALUES (?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE guild = ?, channel = ?, space = ?, mention = ?, updated = ?`,
          [...subscription, ...subscription]
        );
        await loadSubscriptions();

        const color = '#21B66F';
        const embed = new MessageEmbed()
          .setColor(color)
          .addFields(
            { name: 'Space', value: space, inline: true },
            { name: 'Channel', value: channel, inline: true },
            { name: 'Mention', value: mention || 'None', inline: true }
          )
          .setDescription('You have successfully subscribed to space events.');
        msg.reply({ embeds: [embed] }).catch(console.error);
      } else if (command === 'remove' && channel && space) {
        const query = `DELETE FROM subscriptions WHERE guild = ? AND channel = ? AND space = ?`;
        await db.queryAsync(query, [guild, channelId, space]);
        await loadSubscriptions();

        const color = '#EE4145';
        const embed = new MessageEmbed()
          .setColor(color)
          .addFields({ name: 'Space', value: space, inline: true }, { name: 'Channel', value: channel, inline: true })
          .setDescription('You have successfully unsubscribed to space events.');
        msg.reply({ embeds: [embed] }).catch(console.error);
      } else {
        let description = '**Commands**\n\n';
        description += `**Add**\n`;
        description += `!snapshot add <channel> <space> <mention?>\n`;
        description += `*e.g !snapshot add #announcements yam.eth @everyone*\n\n`;
        description += `**Remove**\n`;
        description += `!snapshot remove <channel> <space> <mention?>\n`;
        description += `*e.g !snapshot remove #announcements yam.eth*\n`;

        const subscriptions = await db.queryAsync('SELECT * FROM subscriptions WHERE guild = ?', guild);

        if (subscriptions.length > 0) {
          description += `\n**Subscriptions (${subscriptions.length})**\n\n`;
          subscriptions.forEach(subscription => {
            description += `<#${subscription.channel}> ${subscription.space}\n`;
          });
        }

        const embed = new MessageEmbed();
        embed.setDescription(description);
        msg.reply({ embeds: [embed] }).catch(console.error);
      }
    }
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
    console.log('Discord error:', e);
  }
};

export default client;
