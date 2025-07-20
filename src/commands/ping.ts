import { SlashCommandBuilder } from 'discord.js';
import { Command } from '../types';

const pingCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Replies with Pong!'),
  async execute(interaction) {
    const startTime = Date.now();
    
    await interaction.reply({
      content: 'Pinging...'
    });
    
    const latency = Date.now() - startTime;
    const apiLatency = interaction.client.ws.ping;
    const displayApiLatency = apiLatency === -1 ? 'N/A' : `${Math.round(apiLatency)}ms`;
    
    await interaction.editReply(
      `🏓 Pong!\n**Latency:** ${latency}ms\n**API Latency:** ${displayApiLatency}`
    );
  },
};

export default pingCommand;