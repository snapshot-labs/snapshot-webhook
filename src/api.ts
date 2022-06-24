import express from 'express';
import snapshot from '@snapshot-labs/snapshot.js';
import removeMd from 'remove-markdown';
import { MessageEmbed, MessageActionRow, MessageButton } from 'discord.js';
import { createHash } from 'crypto';
import { sendMessage } from './discord';
import { shortenAddress } from './utils';
import { subs } from './subscriptions';
import pkg from '../package.json';

function sha256(str) {
  return createHash('sha256')
    .update(str)
    .digest('hex');
}

const router = express.Router();

router.get('/', async (req, res) => {
  return res.json({
    name: pkg.name,
    version: pkg.version
  });
});

router.all('/webhook', async (req, res) => {
  console.log('Received', req.body);
  const proposalId = req.body?.id?.replace('proposal/', '') || 'Qmemba2wh7dUiWq62447X7mpXmQ34di1Eym3N7vE7V7WsN';
  const event = req.body?.event || 'proposal/start';
  const secret = req.body?.secret || '0';

  if (sha256(secret) !== '2d0e9a2a8d83396341ce60364fef980a4d7f4591903f6424094578fd4efdaba8') {
    console.log('Wrong secret');
    return res.json({ error: true });
  }

  let color = '#6B7380';
  let status = 'Pending';
  if (event === 'proposal/created') {
    color = '#6B7380';
    return res.json({ success: true });
  }
  if (event === 'proposal/start') {
    status = 'Active';
    color = '#21B66F';
  }
  if (event === 'proposal/end') {
    color = '#7C3AED';
    status = 'Closed';
    return res.json({ success: true });
  }
  if (event === 'proposal/deleted') {
    color = '#EE4145';
    status = 'Deleted';
    return res.json({ success: true });
  }

  const query = {
    proposal: {
      __args: {
        id: proposalId
      },
      space: {
        id: true,
        name: true,
        avatar: true
      },
      id: true,
      type: true,
      author: true,
      title: true,
      body: true,
      choices: true,
      start: true,
      end: true,
      snapshot: true
    }
  };
  let proposal: { [key: string]: any } | null = null;
  try {
    const result = await snapshot.utils.subgraphRequest('https://hub.snapshot.org/graphql', query);
    proposal = result.proposal || null;
  } catch (error) {
    console.log('Snapshot hub error:', error);
  }
  if (!proposal) {
    console.log('No proposal found');
    return res.json({ success: false });
  }
  const url = `https://snapshot.org/#/${proposal.space.id}/proposal/${proposal.id}`;
  let components =
    proposal.choices.length > 5
      ? []
      : proposal.choices.map((choice, i) =>
          new MessageActionRow().addComponents(
            new MessageButton()
              .setLabel(choice)
              .setURL(`${url}?choice=${i + 1}`)
              .setStyle('LINK')
          )
        );
  components = event === 'proposal/start' && proposal.type === 'single-choice' ? components : [];
  const limit = 4096 / 16;
  let preview = removeMd(proposal.body).slice(0, limit);
  if (proposal.body.length > limit) preview += `... [Read more](${url})`;
  const avatar = (proposal.space.avatar || '').replace('ipfs://', 'https://cloudflare-ipfs.com/ipfs/');

  const embed = new MessageEmbed()
    // @ts-ignore
    .setColor(color)
    .setTitle(proposal.title)
    .setURL(url)
    .setTimestamp(proposal.created * 1e3)
    .setAuthor(`${proposal.space.name} by ${shortenAddress(proposal.author)}`, avatar)
    .addFields(
      { name: 'Status', value: status, inline: true },
      { name: 'Snapshot', value: proposal.snapshot, inline: true },
      // { name: 'Start', value: `<t:${proposal.start}:R>`, inline: true },
      { name: 'End', value: `<t:${proposal.end}:R>`, inline: true }
    )
    .setDescription(preview);

  if (subs[proposal.space.id] || subs['*']) {
    [...(subs['*'] || []), ...(subs[proposal.space.id] || [])].forEach(sub => {
      sendMessage(sub.channel, {
        content: `${sub.mention} `,
        embeds: [embed],
        components
      });
    });
  }

  return res.json({ success: true });
});

export default router;
