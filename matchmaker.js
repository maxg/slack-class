const bodyparser = require('body-parser');
const express = require('express');
const { WebClient } = require('@slack/web-api');

const config = require('./config');

// configuration, module.exports = { pairing: ..., questions: ... }
const pairing = require('./matchmaker-pairing');

async function main() {
  const slack = new WebClient(config.slack_token);
  
  let { channels } = await slack.conversations.list({
    types: 'public_channel',
    exclude_archived: true,
  });
  let pairing_channel = channels.find(c => c.name === pairing.pairing);
  let questions_channel = channels.find(c => c.name === pairing.questions);
  
  const app = express();
  
  app.post('/', bodyparser.json(), async (req, res, next) => {
    if (req.body.type === 'url_verification') {
      console.log('url verification');
      return res.send({ challenge: req.body.challenge });
    }
    if (req.body.type === 'event_callback') {
      let event = req.body.event;
      if (event.type === 'member_joined_channel' && event.channel === pairing_channel.id) {
        console.log('member joined pairing channel');
        slack.chat.postEphemeral({
          channel: pairing_channel.id,
          user: event.user,
          blocks: [
              `Use this channel to find a partner...`,
              `For today's class: once you have a partner, *join channel <#${questions_channel.id}>* to ask questions`,
              `(When the bot invites you &amp; your partner to a questions channel before class, always use that one instead :robot_face:)`,
            ].map(text => ({ type: 'section', text: { type: 'mrkdwn', text } })),
        });
      }
      return res.sendStatus(200);
    }
    return res.sendStatus(500);
  });
  
  const server = app.listen(8181, () => console.log('listening', server.address()));
}

if (require.main === module) {
  main();
}
