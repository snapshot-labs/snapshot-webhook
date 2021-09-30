// Invite: https://discord.com/oauth2/authorize?client_id=892847850780762122&permissions=0&scope=bot
import { Client, Intents } from 'discord.js';

const token = process.env.DISCORD_TOKEN;
const channel = '814466963047841792';
const client: any = new Client({ intents: [Intents.FLAGS.GUILDS] });
let speaker;

client.on('ready', async () => {
  // @ts-ignore
  console.log(`Discord bot logged as "${client.user.tag}"`);
  speaker = client.channels.cache.get(channel);
});

client.on('message', msg => {
  if (msg.content === 'ping') {
    msg.reply('pong');
  }
});

if (token) client.login(token);

export const sendMessage = message => {
  if (!token) return;
  try {
    if (speaker) return speaker.send(message);
    console.log('Missing bot message');
    return false;
  } catch (e) {
    console.log(e);
  }
};

export const setActivity = message => {
  try {
    client.user.setActivity(message, { type: 'WATCHING' });
  } catch (e) {
    console.log(e);
  }
};

export default client;
