import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { Command } from '../types';

const infoCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('info')
    .setDescription('Shows information about the bot'),
  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle('Bot Information')
      .setDescription('A TypeScript Discord bot built with discord.js v14')
      .setColor(0x0099ff)
      .setTimestamp()
      .addFields(
        {
          name: 'Bot Version',
          value: '1.0.0',
          inline: true,
        },
        {
          name: 'Discord.js Version',
          value: '14.21.0',
          inline: true,
        },
        {
          name: 'Node.js Version',
          value: process.version,
          inline: true,
        },
        {
          name: 'Uptime',
          value: `<t:${Math.floor(Date.now() / 1000 - process.uptime())}:R>`,
          inline: true,
        }
      )
      .setFooter({
        text: `Requested by ${interaction.user.tag}`,
        iconURL: interaction.user.displayAvatarURL(),
      });

    await interaction.reply({ embeds: [embed] });
  },
};

export default infoCommand;