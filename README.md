# Discord Gemini Live Bot

A Discord bot that integrates with Google's Gemini Live API to enable real-time voice conversations in Discord voice channels. This bot allows users to have natural, conversational interactions with Google's Gemini AI through voice.

## Features

- **Real-time Voice Conversations**: Talk to Gemini AI naturally in Discord voice channels
- **Low-latency Audio Streaming**: Minimal delay between speech and response
- **Voice Activity Detection**: Automatically detects when users start/stop speaking
- **Multi-user Support**: Multiple users can interact with the AI in the same channel
- **Easy Commands**: Simple slash commands to control the bot
- **Robust Error Handling**: Comprehensive logging and error recovery

## Prerequisites

- Node.js 18.0.0 or higher
- Discord Bot Token
- Google Gemini API Key
- A Discord server where you have admin permissions

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd discord-gemini-live-bot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Copy `.env.example` to `.env` and fill in your credentials:
   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your actual values:
   ```
   # Discord Bot Configuration
   DISCORD_TOKEN=your_bot_token_here
   CLIENT_ID=your_client_id_here
   GUILD_ID=your_guild_id_here

   # Gemini API Configuration
   GEMINI_API_KEY=your_gemini_api_key_here

   # Optional: Logging level (debug, info, warn, error)
   LOG_LEVEL=info
   ```

## Getting Your API Keys

### Discord Bot Token
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to the "Bot" section
4. Click "Reset Token" to get your bot token
5. Enable the following Privileged Gateway Intents:
   - Server Members Intent
   - Message Content Intent

### Google Gemini API Key
1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create a new API key
3. Copy the key to your `.env` file

## Setting Up Your Discord Bot

1. **Create the bot application** (see above)
2. **Add the bot to your server**:
   - In the Developer Portal, go to OAuth2 > URL Generator
   - Select the following scopes:
     - `bot`
     - `applications.commands`
   - Select the following bot permissions:
     - `Connect`
     - `Speak`
     - `Use Voice Activity`
     - `Send Messages`
     - `Embed Links`
     - `Read Message History`
     - `Use Slash Commands`
3. **Copy the generated URL** and use it to invite the bot to your server

## Usage

### Starting the Bot

```bash
# Development mode with auto-restart
npm run dev

# Production mode
npm run build
npm start
```

### Bot Commands

Once the bot is running and added to your server, you can use the following slash commands:

#### `/voice join`
Joins the voice channel you're currently in.

#### `/voice leave`
Leaves the current voice channel.

#### `/voice start`
Starts listening to voice activity and begins responding with Gemini AI.

#### `/voice stop`
Stops listening and responding to voice activity.

#### `/voice status`
Shows the current voice connection status.

### Example Usage Flow

1. Join a voice channel in Discord
2. Use `/voice join` to invite the bot
3. Use `/voice start` to begin AI conversations
4. Start speaking - the bot will listen and respond
5. Use `/voice stop` to pause interactions
6. Use `/voice leave` to disconnect the bot

## Technical Architecture

### Audio Processing Pipeline

1. **Discord Audio Input**: 48kHz stereo Opus → PCM conversion
2. **Format Conversion**: 48kHz stereo → 16kHz mono PCM (16-bit)
3. **Gemini Live API**: Sends audio to Google's servers
4. **Response Processing**: 24kHz mono PCM → 48kHz stereo PCM
5. **Discord Audio Output**: PCM → Opus for Discord

### Services

- **GeminiLiveService**: Handles connection to Google's Live API
- **DiscordVoiceService**: Manages Discord voice connections and audio streaming
- **Command System**: Modular slash command handling

## Troubleshooting

### Common Issues

#### Bot won't join voice channel (AbortError/Timeout)
- **Ensure the bot has these permissions:**
  - Connect
  - Speak
  - Use Voice Activity
  - Priority Speaker (optional)
- **Check Discord server region**: Set to a region close to your location
- **Verify bot permissions**: Check channel-specific permissions
- **Test with test-bot.js**: Run `node test-bot.js` to verify basic connectivity
- **Check voice channel type**: Ensure it's a voice channel, not stage channel

#### Voice connection timeout
- **Increase timeout**: The bot now has retry logic with 15-second timeouts
- **Check network**: Ensure no firewall blocking Discord voice ports
- **Restart Discord client**: Sometimes helps with voice connection issues

#### No audio response from Gemini
- **Check your Gemini API key**: Ensure it's valid and has proper permissions
- **Verify bot is connected**: Use `/voice status` to check connection
- **Check console logs**: Look for detailed error messages
- **Test Gemini API**: Try the test script in the repository

#### Application not responding
- **Use deferReply**: Commands now use proper deferReply for longer operations
- **Check bot permissions**: Ensure bot has "Send Messages" and "Embed Links"
- **Verify slash commands**: Re-register commands if needed

### Debug Mode

Enable debug logging by setting `LOG_LEVEL=debug` in your .env file. This will provide detailed logs about:
- Voice connection states
- Audio processing steps
- API communication
- Error details

### Testing Voice Connection

1. **Basic bot test**: `node test-bot.js`
2. **Check permissions**: Ensure bot has all required permissions
3. **Test voice join**: Use `/voice join` in a voice channel
4. **Check status**: Use `/voice status` to verify connection
5. **Test audio**: Use `/voice start` to begin listening

### Voice Connection Debug Steps

1. **Check bot permissions**:
   - Go to Server Settings → Roles → [Bot Role]
   - Ensure these permissions are enabled:
     - Connect
     - Speak
     - Use Voice Activity
     - Priority Speaker

2. **Check channel permissions**:
   - Right-click voice channel → Edit Channel → Permissions
   - Ensure bot role has access

3. **Test with minimal setup**:
   - Create a new voice channel
   - Give bot Administrator permissions temporarily
   - Test `/voice join`

4. **Check Discord.js version**:
   - Ensure you're using discord.js v14.x
   - Check package.json for correct versions

### Debug Mode

Enable debug logging by setting `LOG_LEVEL=debug` in your `.env` file. This will provide detailed logs about:
- Voice connection states
- Audio processing steps
- API communication
- Error details

## Development

### Project Structure
```
src/
├── commands/          # Slash commands
├── services/          # Core services
├── types.ts          # TypeScript definitions
├── config.ts         # Configuration
├── logger.ts         # Logging utility
└── index.ts          # Bot entry point
```

### Adding New Commands
1. Create a new file in `src/commands/`
2. Follow the pattern in existing commands
3. Export a default command object
4. The bot will auto-register new commands on startup

### Audio Processing Improvements
For production use, consider:
- Using proper audio processing libraries (FFmpeg, SoX)
- Implementing noise reduction
- Adding voice activity detection tuning
- Implementing audio buffering for smoother playback

## Security Notes

- Never commit your `.env` file or API keys
- Use environment variables for all sensitive data
- Consider implementing rate limiting for API calls
- Monitor API usage to prevent unexpected costs

## License

MIT License - see LICENSE file for details

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review the console logs with debug mode enabled
3. Open an issue on the repository