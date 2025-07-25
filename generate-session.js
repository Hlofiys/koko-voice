// Telegram Session String Generator
// Run this once to generate your session string

import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import input from 'input';

async function generateSession() {
    console.log('🔐 Telegram Session String Generator');
    console.log('=====================================\n');

    // Get API credentials
    const apiId = await input.text('Enter your API ID from my.telegram.org: ');
    const apiHash = await input.text('Enter your API Hash from my.telegram.org: ');
    
    if (!apiId || !apiHash) {
        console.error('❌ API ID and API Hash are required!');
        process.exit(1);
    }

    console.log('\n📱 Starting Telegram authentication...\n');

    const stringSession = new StringSession(''); // Empty session for first time
    const client = new TelegramClient(stringSession, parseInt(apiId), apiHash, {
        connectionRetries: 5,
    });

    try {
        await client.start({
            phoneNumber: async () => {
                const phone = await input.text('Enter your phone number (with country code, e.g., +1234567890): ');
                return phone;
            },
            password: async () => {
                const password = await input.password('Enter your 2FA password (if enabled, or press Enter to skip): ');
                return password || '';
            },
            phoneCode: async () => {
                const code = await input.text('Enter the verification code sent to your phone: ');
                return code;
            },
            onError: (err) => {
                console.error('❌ Authentication error:', err.message);
            },
        });

        console.log('\n✅ Authentication successful!');
        
        // Get the session string
        const sessionString = client.session.save();
        
        console.log('\n🔑 Your Session String:');
        console.log('========================');
        console.log(sessionString);
        console.log('========================\n');
        
        console.log('📝 Add this to your .env file:');
        console.log(`TELEGRAM_API_ID=${apiId}`);
        console.log(`TELEGRAM_API_HASH=${apiHash}`);
        console.log(`TELEGRAM_SESSION_STRING=${sessionString}`);
        console.log(`TELEGRAM_PHONE_NUMBER=your_phone_number_here\n`);
        
        console.log('⚠️  Keep this session string secure - it gives access to your Telegram account!');
        
        await client.disconnect();
        
    } catch (error) {
        console.error('❌ Error generating session:', error.message);
        process.exit(1);
    }
}

generateSession().catch(console.error);