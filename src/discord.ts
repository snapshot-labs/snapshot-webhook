import { Client, Intents, MessageEmbed, Permissions } from 'discord.js';
import db from './mysql';
import { loadSubscriptions } from './subscriptions';

const token = process.env.DISCORD_TOKEN;
const client: any = new Client({
  intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.DIRECT_MESSAGES]
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

client.on('ready', async () => {
  ready = true;
  console.log(`Discord bot logged as "${client.user.tag}"`);
  setActivity('!');
  await loadSubscriptions();
});

client.on('messageCreate', async msg => {
  const guild = msg.guild.id;
  console.log('Received', guild, msg.author.username, ':', msg.content)

  const ts = parseInt((Date.now() / 1e3).toFixed());
  const isAdmin = msg.member.permissions?.has(Permissions.FLAGS.ADMINISTRATOR);

  if (msg.author.bot) return;

  if (msg.content === '!ping') msg.reply('Pong?');

  if (isAdmin) {
    console.log('isAdmin', isAdmin);
    const [id, command, channel, space, mention] = msg.content.split(' ');
    if (id === '!snapshot') {
      const channelId = (channel || '').replace('<#', '').replace('>', '');

      if (['add', 'update'].includes(command)) {
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
        msg.reply({ embeds: [embed] });
      } else if (command === 'remove') {
        const query = `DELETE FROM subscriptions WHERE guild = ? AND channel = ? AND space = ?`;
        await db.queryAsync(query, [guild, channelId, space]);
        await loadSubscriptions();

        const color = '#EE4145';
        const embed = new MessageEmbed()
          .setColor(color)
          .addFields({ name: 'Space', value: space, inline: true }, { name: 'Channel', value: channel, inline: true })
          .setDescription('You have successfully unsubscribed to space events.');
        msg.reply({ embeds: [embed] });
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
        msg.reply({ embeds: [embed] });
      }
    }
  }
});

export const sendMessage = (channel, message) => {
  try {
    const speaker = client.channels.cache.get(channel);
    speaker.send(message);
    return true;
  } catch (e) {
    console.log('Missing', e);
  }
};

export default client;
