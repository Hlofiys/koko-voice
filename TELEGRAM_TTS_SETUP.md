# Telegram Silero TTS Setup (Personal Account)

## ✅ **Complete TTS Rework**

The bot now uses **your personal Telegram account** to message @silero_voice_bot for high-quality Russian text-to-speech.

## **How It Works:**
```
Text → Your Telegram Account → @silero_voice_bot → MP3/OGG Audio → Discord
```

## **Features:**
- 🎯 **Silero Neural TTS**: State-of-the-art Russian speech synthesis
- 🔊 **Excellent Quality**: Much better than Google TTS or espeak-ng
- 💰 **Completely Free**: Uses your existing Telegram account
- ⚡ **Direct Integration**: No bot creation needed
- 🔒 **Personal**: Uses your own Telegram session

## **Setup Instructions:**

### 1. **Get Telegram API Credentials**
1. Go to [my.telegram.org](https://my.telegram.org)
2. Log in with your phone number
3. Go to "API Development Tools"
4. Create a new application:
   - App title: `Discord TTS Bot`
   - Short name: `discord-tts`
5. Copy `api_id` and `api_hash`

### 2. **Test @silero_voice_bot**
1. Find [@silero_voice_bot](https://t.me/silero_voice_bot) on Telegram
2. Send it some Russian text
3. Verify it responds with audio

### 3. **Generate Session String**
You need to create a session string for authentication:

```bash
# Run the session generator script
node generate-session.js

# Follow the prompts:
# 1. Enter your API ID
# 2. Enter your API Hash  
# 3. Enter your phone number
# 4. Enter verification code from SMS
# 5. Enter 2FA password (if enabled)
# 6. Copy the generated session string
```

### 4. **Configure Environment**
Update your `.env` file:
```bash
DISCORD_TOKEN=your_discord_bot_token_here
CLIENT_ID=your_discord_client_id_here
GUILD_ID=your_discord_guild_id_here
GEMINI_API_KEY=your_gemini_api_key_here

# Telegram User Configuration
TELEGRAM_API_ID=1234567
TELEGRAM_API_HASH=abcdef1234567890abcdef1234567890
TELEGRAM_PHONE_NUMBER=+1234567890
TELEGRAM_SESSION_STRING=your_long_session_string_here
```

### 5. **Account Requirements**
Your Telegram account needs to:
- Have access to @silero_voice_bot (public bot)
- Be able to send/receive messages
- Have API access enabled

## **Technical Flow:**

### **1. Text Processing**
```typescript
text → telegramBot.api.sendMessage('@silero_voice_bot', text)
```

### **2. Audio Reception**
```typescript
telegramBot.on('message:voice', async (ctx) => {
    // Download OGG voice message
    const file = await ctx.getFile();
    const audioBuffer = await downloadTelegramFile(file.file_path);
})

telegramBot.on('message:audio', async (ctx) => {
    // Download MP3 audio file
    const file = await ctx.getFile();
    const audioBuffer = await downloadTelegramFile(file.file_path);
})
```

### **3. Format Conversion**
- Downloads audio from Telegram
- Converts OGG → WAV if needed
- Returns Buffer for Discord playback

## **Advantages:**

### **vs Google TTS:**
- ✅ **Free** (no API costs)
- ✅ **Better Russian quality** (Silero neural models)
- ✅ **No credentials setup**

### **vs espeak-ng:**
- ✅ **Much more natural** sounding
- ✅ **Professional quality**
- ✅ **No local dependencies**

## **Error Handling:**
- 30-second timeout for Silero bot responses
- Automatic cleanup of temporary files
- Fallback error messages in Russian

## **Testing:**
```bash
npm run build
npm run dev
```

Then:
1. Join Discord voice channel
2. Use `/live` command
3. Speak in Russian
4. Bot will respond with Silero TTS quality!

## **Troubleshooting:**

### **Bot not responding:**
- Check TELEGRAM_BOT_TOKEN is correct
- Verify @silero_voice_bot is accessible
- Check bot has message permissions

### **Audio not downloading:**
- Verify Telegram bot token permissions
- Check network connectivity to Telegram API
- Ensure ffmpeg is installed for format conversion

### **Timeout errors:**
- @silero_voice_bot might be busy
- Try shorter text messages
- Check if bot is rate-limited

## **Silero Voice Bot Info:**
- **Username**: @silero_voice_bot
- **Purpose**: Free neural TTS for Russian
- **Input**: Text messages
- **Output**: High-quality voice messages
- **Languages**: Russian (primary), some others