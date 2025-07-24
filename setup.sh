#!/bin/bash

echo "🤖 Discord Voice Recording Bot Setup"
echo "===================================="

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 24 ]; then
    echo "❌ Node.js version 24+ is required. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js version: $(node -v)"

# Check if FFmpeg is installed
if ! command -v ffmpeg &> /dev/null; then
    echo "⚠️  FFmpeg is not installed. Installing FFmpeg..."
    
    # Detect OS and install FFmpeg
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        sudo apt update && sudo apt install -y ffmpeg
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        if command -v brew &> /dev/null; then
            brew install ffmpeg
        else
            echo "❌ Homebrew not found. Please install FFmpeg manually."
            exit 1
        fi
    else
        echo "❌ Please install FFmpeg manually for your operating system."
        exit 1
    fi
fi

echo "✅ FFmpeg is installed"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cp .env.example .env
    echo "⚠️  Please edit .env file with your Discord bot token and other settings"
else
    echo "✅ .env file already exists"
fi

# Create recordings directory
mkdir -p recordings
echo "📁 Created recordings directory"

# Build the project
echo "🔨 Building the project..."
npm run build

echo ""
echo "🎉 Setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit .env file with your Discord bot token and OpenAI API key"
echo "2. Deploy slash commands: npm run deploy"
echo "3. Start the bot: npm start"
echo ""
echo "Commands available:"
echo "- /join    - Join your voice channel"
echo "- /record  - Start recording a user"
echo "- /stop    - Stop recording"
echo "- /status  - Check bot status"
echo "- /leave   - Leave voice channel"