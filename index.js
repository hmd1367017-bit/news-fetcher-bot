const { Client, GatewayIntentBits, AttachmentBuilder } = require('discord.js');
const axios = require('axios');
const { handleVoiceCommand } = require('./commands');
const { checkMessageModeration, handleModeration } = require('./moderation');
const { initMemoryLogger } = require('./memoryManager');
const { getChatHistory, saveMessage } = require('./database'); // ডাটাবেস মডিউল ইমপোর্ট করুন
const express = require('express');
const cors = require('cors');

const app = express();
app.use(express.json({ limit: '10mb' })); // বড় ইমেজ বাফার রিসিভ করার জন্য লিমিট বাড়িয়ে দেওয়া হলো
app.use(cors());

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,           
    GatewayIntentBits.GuildMessages,     
    GatewayIntentBits.MessageContent,    
    GatewayIntentBits.GuildVoiceStates   
  ]
});

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
const CHANNEL_ID = process.env.CHANNEL_ID;

// আপনার দেওয়া সমস্ত এপিআই কিগুলোর লিস্ট (ফলওভার সিস্টেমের জন্য সাজানো)
const aiProviders = [
  {
    name: "OpenRouter 1",
    type: "openrouter",
    key: process.env.OPENROUTER_API_KEY_1,
    model: "poolside/laguna-s-2.1:free"
  },
  {
    name: "OpenAI / Custom 1",
    type: "openai",
    key: process.env.OPENAI_API_KEY,
    model: "gpt-4o-mini"
  },
  {
    name: "OpenRouter 2",
    type: "openrouter",
    key: process.env.OPENROUTER_API_KEY_2,
    model: "inclusionai/ling-3.0-flash-sante:free"
  },
  {
    name: "OpenRouter 3",
    type: "openrouter",
    key: process.env.OPENROUTER_API_KEY_3,
    model: "poolside/laguna-s-2.1:free"
  }
];

// এআই হ্যান্ডলার (৩ বার রtry লুপ সহ)
// এআই হ্যান্ডলার (সিস্টেম প্রম্পট ছাড়া)
async function checkMessageWithAI(historyMessages) {
  const maxRetries = 3; // মোট ৩ বার চেষ্টা করবে

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`--- AI Request Attempt ${attempt} of ${maxRetries} ---`);

    for (let provider of aiProviders) {
      try {
        console.log(`Trying with ${provider.name}...`);

        const apiUrl = provider.type === "openrouter" 
          ? 'https://openrouter.ai/api/v1/chat/completions' 
          : 'https://api.openai.com/v1/chat/completions';

        // সিস্টেম প্রম্পট বাদ দিয়ে সরাসরি হিস্ট্রি বা মেসেজগুলো পাঠানো হচ্ছে
        const messagesPayload = historyMessages.map(m => ({ 
          role: m.role === 'assistant' ? 'assistant' : 'user', 
          content: m.content 
        }));

        const response = await axios.post(
          apiUrl,
          {
            model: provider.model,
            messages: messagesPayload
          },
          { headers: { 'Authorization': `Bearer ${provider.key}`} }
        );

        const reply = response.data.choices[0].message.content.trim();
        return reply; // সফল হলে রেসপন্স রিটার্ন করবে

      } catch (error) {
        console.warn(`${provider.name} failed. Switching to next API key...`);
      }
    }
    
    console.warn(`Attempt ${attempt} failed for all providers. Retrying from the beginning...`);
  }

  return "⚠️ Sorry, I'm experiencing some connection issues at the moment.";
}

// বোটের মাধ্যমে চ্যানেলে ছবি পাঠানোর ফাংশন
async function sendImageToDiscord(imageBuffer, caption = "📊 **BD E-SPORTS Standings**") {
    try {
        const channelID = process.env.channelID; // আপনার কাঙ্ক্ষিত চ্যানেল আইডি
        const channel = await client.channels.fetch(channelID);

        if (!channel) {
            console.error("❌ চ্যানেল খুঁজে পাওয়া যায়নি!");
            return false;
        }

        const customFileName = req.body.fileName || `standings_${Math.floor(Math.random() * 10000)}.jpg`;
        const attachment = new AttachmentBuilder(Buffer.from(imageBuffer), { name: customFileName });

        await channel.send({
            content: caption,
            files: [attachment]
        });

        console.log("✅ সফলভাবে ডিসকর্ডে ছবি পাঠানো হয়েছে!");
        return true;
    } catch (error) {
        console.error("❌ ডিসকর্ডে পাঠাতে সমস্যা হয়েছে:", error);
        return false;
    }
}
module.exports = { sendImageToDiscord };

// মেসেজের ইমোশন বুঝে অটো-রিঅ্যাক্ট দেওয়ার ফাংশন
async function handleEmotionReaction(message) {
  try {
    const prompt = `Analyze the sentiment of this message: "${message.content}". Reply with ONLY ONE word from this list: [HAPPY, SAD, LOVE, ANGRY, SURPRISE, NEUTRAL].`;
    const sentiment = await checkMessageWithAI([{ role: 'user', content: prompt }]);
    const cleanSentiment = sentiment ? sentiment.trim().toUpperCase() : 'NEUTRAL';

    // ইমোশন অনুযায়ী রিঅ্যাক্ট দেওয়া
    if (cleanSentiment.includes('HAPPY')) {
      await message.react('😄');
    } else if (cleanSentiment.includes('SAD')) {
      await message.react('😢');
    } else if (cleanSentiment.includes('LOVE')) {
      await message.react('❤️');
    } else if (cleanSentiment.includes('ANGRY')) {
      await message.react('😡');
    } else if (cleanSentiment.includes('SURPRISE')) {
      await message.react('😲');
    }
  } catch (error) {
    console.error('Emotion reaction error:', error);
  }
}

client.once('clientReady', () => {
  console.log(`Bot connected as ${client.user.tag}`);
  console.log('Log Channel ID set to:', LOG_CHANNEL_ID);
  initMemoryLogger(client, LOG_CHANNEL_ID);
  console.log('Multi-API Failover, Voice & Advanced AI Moderation active for all channels!');
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const content = message.content.trim();
  const userId = message.author.id;

  // ১. ভয়েস কমান্ড এবং প্রম্পট জেনারেটর চেক
  if (content.startsWith('!join') || content.startsWith('!leave') || content.startsWith('!prompt')) {
    await handleVoiceCommand(message, checkMessageWithAI);
    return;
  }

  // ২. মডারেশন চেক
  try {
    const moderationResult = await checkMessageModeration(content, aiProviders, axios);
    if (moderationResult !== "SAFE") {
      await handleModeration(message, moderationResult);
      return; 
    }
  } catch (error) {
    console.error('Moderation check error:', error);
  }

  // ৩. চ্যানেলের তালিকা দেখার কমান্ড
  if (content === '!channels' || content.includes('চ্যানেলের নাম')) {
    const textChannels = message.guild.channels.cache
      .filter(c => c.type === 0)
      .map(c => `• #${c.name} (ID: ${c.id})`)
      .join('\n');
    
    return message.reply(`📋 **এই সার্ভারের টেক্সট চ্যানেলগুলো হলো:**\n${textChannels}`);
  }

  // ৪. নির্দিষ্ট চ্যানেলে মেসেজ পাঠানোর কমান্ড 
  if (content.startsWith('!send')) {
    const args = content.split(' ');
    const targetChannel = message.mentions.channels.first();
    const messageToSend = args.slice(2).join(' ');

    if (!targetChannel) {
      return message.reply('❌ দয়া করে `#` দিয়ে সঠিক চ্যানেলটি মেনশন করুন! যেমন: `!send #general আপনার মেসেজ`');
    }

    if (!messageToSend) {
      return message.reply('❌ চ্যানেলে পাঠানোর মতো কোনো মেসেজ বা লেখা পাওয়া যায়নি!');
    }

    try {
      await targetChannel.send(messageToSend);
      return message.reply(`✅ সফলভাবে **#${targetChannel.name}** চ্যানেলে মেসেজ পাঠানো হয়েছে!`);
    } catch (error) {
      console.error('Failed to send message to target channel:', error);
      return message.reply('❌ ওই চ্যানেলে মেসেজ পাঠাতে সমস্যা হচ্ছে। বটের সেই চ্যানেলে লেখার পারমিশন আছে কি না চেক করুন।');
    }
  }

  await handleEmotionReaction(message);

  // এআই মেনশন বা রিপ্লাই লজিক
  const isBotMentioned = message.mentions.users.has(client.user.id) && !message.mentions.everyone;
  
  let isReplyToBot = false;
  if (message.reference) {
    try {
      const referencedMessage = await message.channel.messages.fetch(message.reference.messageId);
      if (referencedMessage && referencedMessage.author.id === client.user.id) {
        isReplyToBot = true;
      }
    } catch (err)  {
      console.error("Error fetching referenced message:", err);
    }
  }

  if (isBotMentioned || isReplyToBot) {
    const cleanContent = message.content.replace(/<@!?\d+>/g, '').trim();

    if (!cleanContent && !isReplyToBot) {
      return message.reply('জি বলুন, আমি কীভাবে আপনাকে সাহায্য করতে পারি?');
    }

    await message.channel.sendTyping();
    const promptText = cleanContent || message.content;

    // ৫. ডাটাবেস থেকে ইউজারের পুরনো চ্যাট হিস্ট্রি ফেচ করা
    getChatHistory(userId, async (rows) => {
      // এআই মডেলে পাঠানোর জন্য ফরম্যাট করা
      const historyMessages = rows.map(row => ({
        role: row.role,
        content: row.content
      }));

      // বর্তমান ইউজারের মেসেজটি হিস্ট্রিতে যোগ করা (এআইকে পাঠানোর জন্য)
      historyMessages.push({ role: 'user', content: promptText });

      // এআই থেকে রেসপন্স আনা
      const aiResponse = await checkMessageWithAI(historyMessages);

      // ডাটাবেসে ইউজারের মেসেজ এবং বটের উত্তর পাকাপাকিভাবে সেভ করা
      saveMessage(userId, 'user', promptText);
      saveMessage(userId, 'assistant', aiResponse);

      await message.reply(aiResponse || 'Sorry, I\'m experiencing some connection issues at the moment.');
    });

    return;
  }
});

// ইলেকট্রন অ্যাপ থেকে রিকোয়েস্ট রিসিভ করার এন্ডপয়েন্ট
app.post('/send-discord-image', async (req, res) => {
    try {
        const { imageBuffer, caption, fileName } = req.body;

        if (!imageBuffer) {
            return res.status(400).json({ success: false, error: "Image buffer missing" });
        }

        const channel = await client.channels.fetch(CHANNEL_ID);
        if (!channel) {
            return res.status(404).json({ success: false, error: "Channel not found" });
        }

        // ⭐ অ্যারে ডেটাকে সরাসরি বাফারে কনভার্ট করার সঠিক পদ্ধতি
        const buffer = Buffer.from(imageBuffer);

        // ⭐ রেন্ডম বা ডায়নামিক ফাইল নাম (ফ্রন্টএন্ড থেকে না আসলে ব্যাকএন্ডে নিজে বানিয়ে নেবে)
        const finalFileName = fileName || `standings_${Math.floor(Math.random() * 90000) + 10000}.jpg`;

        const attachment = new AttachmentBuilder(buffer, { name: finalFileName });

        await channel.send({
            content: caption || "📊 **BD E-SPORTS Standings**",
            files: [attachment]
        });

        console.log(`✅ ছবি পাঠানো সফল! নাম: ${finalFileName}`);
        res.json({ success: true });
    } catch (error) {
        console.error("❌ সার্ভার এরর:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 Local Bridge Server running on http://localhost:${PORT}`);
});

client.login(DISCORD_TOKEN);
