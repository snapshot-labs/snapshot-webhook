// Invite: https://discord.com/oauth2/authorize?client_id=892847850780762122&permissions=0&scope=bot
import { Client, Intents } from 'discord.js';

const token = process.env.DISCORD_TOKEN;
const client: any = new Client({ intents: [Intents.FLAGS.GUILDS] });
let ready = false;

client.login(token);

client.on('ready', async () => {
  ready = true;
  console.log(`Discord bot logged as "${client.user.tag}"`);
});

client.on('message', msg => {
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

export const setActivity = message => {
  try {
    if (ready) {
      client.user.setActivity(message, { type: 'WATCHING' });
    } else {
      console.log('Missing', message);
    }
  } catch (e) {
    console.log(e);
  }
};

export default client;
