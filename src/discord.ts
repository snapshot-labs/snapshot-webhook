import { Client, Intents } from 'discord.js';

const token = process.env.DISCORD_TOKEN;
const client: any = new Client({
  intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.DIRECT_MESSAGES]
});
export let ready = false;
// const invite = 'https://discord.com/oauth2/authorize?client_id=892847850780762122&permissions=536602999889&scope=bot';

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
});

client.on('messageCreate', async msg => {
  console.log('Guild', msg.guild.id);
  if (msg.content === '!ping') msg.reply('Pong?');
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
