import express from 'express';
import snapshot from '@snapshot-labs/snapshot.js';
import removeMd from 'remove-markdown';
import { MessageEmbed, MessageActionRow, MessageButton } from 'discord.js';
import { sendMessage } from './discord';
import { shortenAddress } from './utils';

const router = express.Router();

router.all('/webhook', async (req, res) => {
  console.log('Received', req.body);
  const proposalId = req.body?.id?.replace('proposal/', '') || 'QmbHUUX1GZQRS7eQ9v7cZQ7J9kpEC96KLhUtkrDrufBGCc';
  const event = req.body?.event || 'proposal/start';

  let color = '#6B7380';
  let status = 'Pending';
  if (event === 'proposal/created') color = '#6B7380';
  if (event === 'proposal/start') {
    status = 'Active';
    color = '#21B66F';
  }
  if (event === 'proposal/end') {
    color = '#7C3AED';
    status = 'Closed';
  }
  if (event === 'proposal/deleted') {
    color = '#EE4145';
    status = 'Deleted';
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
      author: true,
      title: true,
      body: true,
      choices: true,
      start: true,
      end: true,
      snapshot: true
    }
  };
  const { proposal } = await snapshot.utils.subgraphRequest('https://hub.snapshot.org/graphql', query);

  const url = `https://snapshot.org/#/${proposal.space.id}/proposal/${proposal.id}`;
  const components = proposal.choices.map((choice, i) =>
    new MessageActionRow().addComponents(
      new MessageButton()
        .setLabel(choice)
        .setURL(`${url}?choice=${i + 1}`)
        .setStyle('LINK')
    )
  );
  const limit = 4096 / 16;
  let preview = removeMd(proposal.body).slice(0, limit);
  if (proposal.body.length > limit) preview += `... [Read more](${url})`;

  const embed = new MessageEmbed()
    // @ts-ignore
    .setColor(color)
    .setTitle(proposal.title)
    .setURL(url)
    .setTimestamp(proposal.created * 1e3)
    .setAuthor(`${proposal.space.name} by ${shortenAddress(proposal.author)}`, proposal.space.avatar)
    .addFields(
      { name: 'Status', value: status, inline: true },
      { name: 'Snapshot', value: proposal.snapshot, inline: true }
    )
    .setDescription(preview);

  sendMessage({
    // content: 'Pong!',
    embeds: [embed],
    components: event === 'proposal/start' ? components : []
  });

  return res.json({ success: true });
});

export default router;
