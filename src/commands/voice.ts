import {
  SlashCommandBuilder,
  GuildMember,
  VoiceChannel,
  ChatInputCommandInteraction,
} from "discord.js";
import { Command } from "../types";
import { discordVoiceService } from "../services/discord-voice";
import { Logger } from "../logger";

const voiceCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("voice")
    .setDescription("Voice channel commands for Gemini Live interaction")
    .addSubcommand((subcommand) =>
      subcommand.setName("join").setDescription("Join your voice channel"),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("leave").setDescription("Leave the voice channel"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("start")
        .setDescription("Start listening and responding with Gemini Live"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("stop")
        .setDescription("Stop listening and responding"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("status")
        .setDescription("Check the current voice status"),
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    try {
      switch (subcommand) {
        case "join":
          await handleJoin(interaction);
          break;
        case "leave":
          await handleLeave(interaction);
          break;
        case "start":
          await handleStart(interaction);
          break;
        case "stop":
          await handleStop(interaction);
          break;
        case "status":
          await handleStatus(interaction);
          break;
        default:
          await interaction.reply({
            content: "Unknown command",
            ephemeral: true,
          });
      }
    } catch (error) {
      Logger.error("Error executing voice command:", error);
      await interaction.reply({
        content: "An error occurred while processing your command.",
        ephemeral: true,
      });
    }
  },
};

async function handleJoin(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const member = interaction.member as GuildMember;

  if (!member.voice.channel) {
    await interaction.reply({
      content: "You need to be in a voice channel to use this command!",
      ephemeral: true,
    });
    return;
  }

  const voiceChannel = member.voice.channel as VoiceChannel;

  // Additional validation
  if (!voiceChannel.joinable) {
    await interaction.reply({
      content:
        "❌ I cannot join this voice channel. Please check my permissions.",
      ephemeral: true,
    });
    return;
  }

  if (voiceChannel.full) {
    await interaction.reply({
      content: "❌ This voice channel is full.",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    Logger.info(
      `User ${member.user.tag} requested bot to join ${voiceChannel.name}`,
    );
    await discordVoiceService.joinChannel(voiceChannel);
    await interaction.editReply({
      content: `✅ Successfully joined ${voiceChannel.name}! Use \`/voice start\` to begin AI conversations.`,
    });
  } catch (error) {
    Logger.error("Error joining voice channel:", error);

    let errorMessage = "❌ Failed to join voice channel";
    if (error instanceof Error) {
      if (error.message.includes("permission")) {
        errorMessage =
          '❌ Bot is missing required permissions. Please ensure the bot has "Connect" and "Speak" permissions for this channel.';
      } else if (
        error.message.includes("timeout") ||
        error.message.includes("ABORT_ERR")
      ) {
        errorMessage =
          "❌ Voice connection timed out. This could be due to:\n• Network connectivity issues\n• Discord server region settings\n• Bot permissions\n\nPlease try again in a few seconds.";
      } else {
        errorMessage = `❌ ${error.message}`;
      }
    }

    await interaction.editReply({ content: errorMessage });
  }
}

async function handleLeave(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  try {
    discordVoiceService.leaveChannel();
    await interaction.editReply({ content: "✅ Left the voice channel!" });
  } catch (error) {
    Logger.error("Error leaving voice channel:", error);
    await interaction.editReply({
      content: `❌ Failed to leave voice channel: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
  }
}

async function handleStart(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  if (!discordVoiceService.isConnected()) {
    await interaction.editReply({
      content:
        "❌ I need to be in a voice channel first! Use `/voice join` to invite me.",
    });
    return;
  }

  const member = interaction.member as GuildMember;
  const voiceChannel = member.voice.channel as VoiceChannel;

  try {
    await discordVoiceService.startListening(voiceChannel);
    await interaction.editReply({
      content: "🎤 Started listening and responding with Gemini Live!",
    });
  } catch (error) {
    Logger.error("Error starting Gemini Live:", error);
    await interaction.editReply({
      content: `❌ Failed to start Gemini Live: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
  }
}

async function handleStop(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  try {
    discordVoiceService.stopListening();
    await interaction.editReply({
      content: "⏹️ Stopped listening and responding.",
    });
  } catch (error) {
    Logger.error("Error stopping Gemini Live:", error);
    await interaction.editReply({
      content: `❌ Failed to stop listening: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
  }
}

async function handleStatus(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const isConnected = discordVoiceService.isConnected();
  const isActive = discordVoiceService.isActive();
  const member = interaction.member as GuildMember;

  let status = "**🎤 Voice Bot Diagnostic Status**\n";
  status += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

  // Connection Status
  status += `**Connection Status:**\n`;
  status += `• Voice Connection: ${isConnected ? "✅ Connected" : "❌ Not Connected"}\n`;
  status += `• Listening Mode: ${isActive ? "✅ Active" : "❌ Inactive"}\n`;

  // User Status
  status += `\n**User Status:**\n`;
  status += `• In Voice Channel: ${member.voice.channel ? `✅ ${member.voice.channel.name}` : "❌ Not in voice"}\n`;

  if (member.voice.channel) {
    const voiceChannel = member.voice.channel as VoiceChannel;
    const botMember = interaction.guild?.members.me;

    if (botMember) {
      const permissions = voiceChannel.permissionsFor(botMember);
      status += `• Bot Permissions:\n`;
      status += `  - Connect: ${permissions?.has("Connect") ? "✅" : "❌"}\n`;
      status += `  - Speak: ${permissions?.has("Speak") ? "✅" : "❌"}\n`;
      status += `  - Use Voice Activity: ${permissions?.has("UseVAD") ? "✅" : "❌"}\n`;
    }

    status += `• Channel Info:\n`;
    status += `  - Users in channel: ${voiceChannel.members.size}\n`;
    status += `  - Channel full: ${voiceChannel.full ? "❌ Yes" : "✅ No"}\n`;
  }

  // Gemini Status
  status += `\n**AI Status:**\n`;
  const geminiSession = discordVoiceService.isActive();
  status += `• Gemini Live Session: ${geminiSession ? "✅ Active" : "❌ Not Active"}\n`;

  // Instructions
  status += `\n**📋 Next Steps:**\n`;
  if (!member.voice.channel) {
    status += `1️⃣ Join a voice channel first\n`;
    status += `2️⃣ Use \`/voice join\` to invite the bot\n`;
  } else if (!isConnected) {
    status += `1️⃣ Use \`/voice join\` to connect the bot\n`;
  } else if (!isActive) {
    status += `1️⃣ Use \`/voice start\` to begin AI conversations\n`;
  } else {
    status += `✅ **Bot is ready!** Speak in voice chat to interact\n`;
    status += `• Use \`/voice stop\` to pause listening\n`;
    status += `• Use \`/voice leave\` to disconnect\n`;
  }

  // Troubleshooting
  if (!isConnected || !isActive) {
    status += `\n**🔧 Troubleshooting:**\n`;
    status += `• Check bot permissions in voice channel\n`;
    status += `• Ensure Discord isn't muted/deafened\n`;
    status += `• Try rejoining the voice channel\n`;
    status += `• Check your microphone is working\n`;
  }

  await interaction.reply({ content: status, ephemeral: true });
}

export default voiceCommand;
