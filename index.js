const fs = require('fs');
const path = require('path');
const {
  Client,
  GatewayIntentBits,
  Events,
  SlashCommandBuilder,
  REST,
  Routes,
  PermissionFlagsBits,
} = require('discord.js');

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const CONFIG_PATH = path.join(__dirname, 'rolePings.json');

function loadConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return {};
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (err) {
    console.error('Failed to load config:', err);
    return {};
  }
}

function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save config:', err);
  }
}

const rolePingMap = loadConfig();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const commands = [
  new SlashCommandBuilder()
    .setName('setroleping')
    .setDescription('When a role is pinged, automatically ping a user.')
    .addRoleOption(option =>
      option.setName('role').setDescription('Role to watch').setRequired(true)
    )
    .addUserOption(option =>
      option.setName('user').setDescription('User to ping').setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('removeroleping')
    .setDescription('Remove role ping mapping.')
    .addRoleOption(option =>
      option.setName('role').setDescription('Role').setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('listrolepings')
    .setDescription('List all role ping mappings.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
].map(command => command.toJSON());

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);

  try {
    console.log('Registering slash commands...');
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );
    console.log('Slash commands registered.');
  } catch (err) {
    console.error('Failed to register commands:', err);
  }
}

client.once(Events.ClientReady, readyClient => {
  console.log(`Logged in as ${readyClient.user.tag}`);

  client.user.setPresence({
    activities: [
      {
        name: 'role pings',
        type: 3, // watching
      },
    ],
    status: 'online',
  });
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (!interaction.guild) return;

  const guildId = interaction.guild.id;
  if (!rolePingMap[guildId]) rolePingMap[guildId] = {};

  if (interaction.commandName === 'setroleping') {
    const role = interaction.options.getRole('role', true);
    const user = interaction.options.getUser('user', true);

    rolePingMap[guildId][role.id] = user.id;
    saveConfig(rolePingMap);

    await interaction.reply({
      content: `Saved: whenever ${role} is pinged, I will also ping ${user}.`,
      ephemeral: true,
    });
  }

  if (interaction.commandName === 'removeroleping') {
    const role = interaction.options.getRole('role', true);

    delete rolePingMap[guildId][role.id];
    saveConfig(rolePingMap);

    await interaction.reply({
      content: `Removed mapping for ${role}.`,
      ephemeral: true,
    });
  }

  if (interaction.commandName === 'listrolepings') {
    const entries = Object.entries(rolePingMap[guildId] || {});
    if (!entries.length) {
      await interaction.reply({
        content: 'No mappings set.',
        ephemeral: true,
      });
      return;
    }

    const lines = entries.map(([roleId, userId]) => `<@&${roleId}> → <@${userId}>`);

    await interaction.reply({
      content: lines.join('\n'),
      ephemeral: true,
    });
  }
});

client.on(Events.MessageCreate, async message => {
  if (!message.guild) return;
  if (message.author.bot) return;

  const guildId = message.guild.id;
  const guildMappings = rolePingMap[guildId];
  if (!guildMappings) return;

  const mentionedRoles = message.mentions.roles;
  if (!mentionedRoles.size) return;

  const usersToPing = new Set();

  for (const [roleId] of mentionedRoles) {
    const mappedUserId = guildMappings[roleId];
    if (mappedUserId) usersToPing.add(mappedUserId);
  }

  if (!usersToPing.size) return;

  const pingText = [...usersToPing].map(id => `<@${id}>`).join(' ');

  await message.reply({
    content: pingText,
    allowedMentions: {
      users: [...usersToPing],
    },
  });
});

(async () => {
  await registerCommands();
  await client.login(TOKEN);
})();
