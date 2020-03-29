const { WebClient } = require('@slack/web-api');

const config = require('./config');

// staff, module.exports = [ ... staff usernames ... ]
const staff = require('./sorting-hat-staff');
// student groups, module.exports = [ [ ... staff & student usernames ... ], [ ... ], ... ]
const student_groups = require('./sorting-hat-students');

async function main() {
  const slack = new WebClient(config.slack_token);
  
  const users_by_id = new Map();
  const users_by_username = new Map();
  const bot_ids = new Set();
  for await (let { members } of slack.paginate('users.list')) {
    for (let user of members) {
      if (user.id === 'USLACKBOT' || user.is_bot) {
        bot_ids.add(user.id);
      } else if (user.profile.email !== `${user.name}@${config.email_domain}`) {
        console.warn(`[warning] ${user.profile.email} vs ${user.name} (${user.real_name})`);
      }
      let obj = {
        id: user.id,
        name: user.name,
        real_name: user.real_name,
        profile_email: user.profile.email,
        is_admin: user.is_admin,
        is_owner: user.is_owner,
      };
      users_by_id.set(user.id, obj);
      users_by_username.set(user.name, obj);
    }
  }
  const staff_ids = new Set(staff.map(u => users_by_username.get(u).id));
  
  let { channels } = await slack.conversations.list({
    types: 'public_channel',
    exclude_archived: true,
  });
  let pairing_channel = channels.find(c => c.name === 'pairing');
  let question_channels = channels.filter(c => c.name.startsWith('questions-'));
  question_channels.sort((a, b) => a.name.localeCompare(b.name));
  console.log('questions channels:', question_channels.length);
  
  await updateMembership(pairing_channel, new Set());
  
  for (let ii = 0; ii < question_channels.length; ii++) {
    let group = (student_groups[ii] || []).map(u => users_by_username.get(u));
    let group_ids = new Set(group.map(u => u.id));
    await updateMembership(question_channels[ii], group_ids);
  }
  
  async function updateMembership({ id, name }, group_ids) {
    let { members } = await slack.conversations.members({ channel: id });
    let remove = members.filter(m => ! group_ids.has(m) && ! staff_ids.has(m) && ! bot_ids.has(m));
    let keep = members.filter(m => ! remove.includes(m));
    let add = [...group_ids].filter(m => ! members.includes(m));
    console.log('#' + name);
    console.log('  remove', remove.map(m => users_by_id.get(m).name));
    console.log('  keep', keep.map(m => users_by_id.get(m).name));
    console.log('  add', add.map(m => users_by_id.get(m).name));
    if (remove.length) {
      for (let user of remove) {
        await slack.conversations.kick({ channel: id, user });
      }
    }
    if (add.length) {
      await slack.conversations.invite({ channel: id, users: add.join(',') });  
    }
  }
}

if (require.main === module) {
  main();
}
