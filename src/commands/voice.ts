import { SlashCommandBuilder, GuildMember, VoiceChannel, ChatInputCommandInteraction } from 'discord.js';
import { Command } from '../types';
import { discordVoiceService } from '../services/discord-voice';
import { Logger } from '../logger';

const voiceCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('voice')
    .setDescription('Voice channel commands for Gemini Live interaction')
    .addSubcommand(subcommand =>
      subcommand
        .setName('join')
        .setDescription('Join your voice channel')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('leave')
        .setDescription('Leave the voice channel')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('start')
        .setDescription('Start listening and responding with Gemini Live')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('stop')
        .setDescription('Stop listening and responding')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('Check the current voice status')
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    
    try {
      switch (subcommand) {
        case 'join':
          await handleJoin(interaction);
          break;
        case 'leave':
          await handleLeave(interaction);
          break;
        case 'start':
          await handleStart(interaction);
          break;
        case 'stop':
          await handleStop(interaction);
          break;
        case 'status':
          await handleStatus(interaction);
          break;
        default:
          await interaction.reply({ content: 'Unknown command', ephemeral: true });
      }
    } catch (error) {
      Logger.error('Error executing voice command:', error);
      await interaction.reply({ content: 'An error occurred while processing your command.', ephemeral: true });
    }
  }
};

async function handleJoin(interaction: ChatInputCommandInteraction): Promise<void> {
  const member = interaction.member as GuildMember;
  
  if (!member.voice.channel) {
    await interaction.reply({ content: 'You need to be in a voice channel to use this command!', ephemeral: true });
    return;
  }

  const voiceChannel = member.voice.channel as VoiceChannel;
  
  // Additional validation
  if (!voiceChannel.joinable) {
    await interaction.reply({
      content: '❌ I cannot join this voice channel. Please check my permissions.',
      ephemeral: true
    });
    return;
  }

  if (voiceChannel.full) {
    await interaction.reply({
      content: '❌ This voice channel is full.',
      ephemeral: true
    });
    return;
  }
  
  await interaction.deferReply({ ephemeral: true });
  
  try {
    Logger.info(`User ${member.user.tag} requested bot to join ${voiceChannel.name}`);
    await discordVoiceService.joinChannel(voiceChannel);
    await interaction.editReply({ content: `✅ Successfully joined ${voiceChannel.name}! Use \`/voice start\` to begin AI conversations.` });
  } catch (error) {
    Logger.error('Error joining voice channel:', error);
    
    let errorMessage = '❌ Failed to join voice channel';
    if (error instanceof Error) {
      if (error.message.includes('permission')) {
        errorMessage = '❌ Bot is missing required permissions. Please ensure the bot has "Connect" and "Speak" permissions for this channel.';
      } else if (error.message.includes('timeout') || error.message.includes('ABORT_ERR')) {
        errorMessage = '❌ Voice connection timed out. This could be due to:\n• Network connectivity issues\n• Discord server region settings\n• Bot permissions\n\nPlease try again in a few seconds.';
      } else {
        errorMessage = `❌ ${error.message}`;
      }
    }
    
    await interaction.editReply({ content: errorMessage });
  }
}

async function handleLeave(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  
  try {
    discordVoiceService.leaveChannel();
    await interaction.editReply({ content: '✅ Left the voice channel!' });
  } catch (error) {
    Logger.error('Error leaving voice channel:', error);
    await interaction.editReply({
      content: `❌ Failed to leave voice channel: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
}

async function handleStart(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  
  if (!discordVoiceService.isConnected()) {
    await interaction.editReply({ content: '❌ I need to be in a voice channel first! Use `/voice join` to invite me.' });
    return;
  }

  try {
    await discordVoiceService.startListening();
    await interaction.editReply({ content: '🎤 Started listening and responding with Gemini Live!' });
  } catch (error) {
    Logger.error('Error starting Gemini Live:', error);
    await interaction.editReply({
      content: `❌ Failed to start Gemini Live: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
}

async function handleStop(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  
  try {
    discordVoiceService.stopListening();
    await interaction.editReply({ content: '⏹️ Stopped listening and responding.' });
  } catch (error) {
    Logger.error('Error stopping Gemini Live:', error);
    await interaction.editReply({
      content: `❌ Failed to stop listening: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
}

async function handleStatus(interaction: ChatInputCommandInteraction): Promise<void> {
  const isConnected = discordVoiceService.isConnected();
  const isActive = discordVoiceService.isActive();
  
  let status = '**Voice Status:**\n';
  status += `Connected: ${isConnected ? '✅' : '❌'}\n`;
  status += `Listening: ${isActive ? '✅' : '❌'}\n`;
  
  if (isConnected) {
    status += '\nUse `/voice start` to begin AI conversations or `/voice leave` to disconnect.';
  } else {
    status += '\nUse `/voice join` to connect to a voice channel.';
  }
  
  await interaction.reply({ content: status, ephemeral: true });
}

export default voiceCommand;