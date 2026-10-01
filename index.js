const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');
const { handleMention, handleVoiceCommand } = require('./commands');
const { checkMessageModeration, handleModeration } = require('./moderation');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,           // ক্যাটাগরি ও চ্যানেল দেখতে পাওয়ার জন্য
    GatewayIntentBits.GuildMessages,     // মেসেজ পড়ার জন্য
    GatewayIntentBits.MessageContent,    // মেসেজের ভেতরের লেখা চেক করার জন্য
    GatewayIntentBits.GuildVoiceStates   // ভয়েস চ্যানেলের জন্য
  ]
});

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const TARGET_CHANNEL_ID = process.env.GUILD_ID; // নির্দিষ্ট টার্গেট চ্যানেল আইডি
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
const TARGET_LOG_CHANNEL_ID = process.env.TARGET_LOG_CHANNEL_ID;

// আপনার দেওয়া সমস্ত এপিআই কিগুলোর লিস্ট (ফলওভার সিস্টেমের জন্য সাজানো)
const aiProviders = [
  {
    name: "OpenAI / Custom 1",
    type: "openai",
    key: process.env.OPEN_AI,
    model: "gpt-4o-mini"
  },
  {
    name: "Other Key 1",
    type: "custom",
    key: "AQ.Ab8RN6JNwU5klnWzagP_Up7gZLRnR5zHuwPqH9oSueWAWZEmCQ"
  },
  {
    name: "Other Key 2",
    type: "custom",
    key: "RRTg1guPAqlZWbcSq8GQe8uQ4bsNpKo6wt2gHESk"
  },
  {
    name: "Other Key 3",
    type: "custom",
    key: "sk-b5a9236c50634ed4815f523a96bb9c81"
  },
  {
    name: "OpenRouter 1",
    type: "openrouter",
    key: process.env.OPENROUTER_API_KEY,
    model: "inclusionai/ling-3.0-flash-sante:free"
  },
  {
    name: "OpenRouter 2",
    type: "openrouter",
    key: process.env.OPENROUTER_API_KEY1,
    model: "poolside/laguna-s-2.1:free"
  }
];

// এআই হ্যান্ডলার (মডারেশন এবং চ্যাট উভয়ের জন্য)
async function checkMessageWithAI(promptText, isChat = false) {
  for (let provider of aiProviders) {
    try {
      console.log(`Trying with ${provider.name}...`);

      // শুধু OpenRouter এবং OpenAI প্রোভাইডার হ্যান্ডেল করার জন্য
      if (provider.type === "openrouter" || provider.type === "openai") {
        const apiUrl = provider.type === "openrouter" 
          ? 'https://openrouter.ai/api/v1/chat/completions' 
          : 'https://api.openai.com/v1/chat/completions';

        const systemPrompt = isChat 
          ? "You are 'BD E-SPORTS ORG', a helpful, friendly, and smart Discord bot assistant in a gaming server. Always reply in Bengali naturally." 
          : "You are a strict Discord server moderator bot named 'BD E-SPORTS ORG'. Analyze if the given message is toxic, abusive, or harmful. If it's a minor insult or bad word, reply with 'WARN'. If it's heavily abusive, toxic, or spam, reply with 'KICK' or 'BAN'. Otherwise, reply with 'SAFE'. Reply with ONLY one word: WARN, KICK, BAN, or SAFE.";

        const response = await axios.post(
          apiUrl,
          {
            model: provider.model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: promptText }
            ]
          },
          { headers: { 'Authorization': `Bearer ${provider.key}` } }
        );

        const reply = response.data.choices[0].message.content.trim().toUpperCase();
        if (isChat) return response.data.choices[0].message.content.trim();
        return reply;
      }
    } catch (error) {
      console.warn(`${provider.name} failed. Switching to next API key...`);
    }
  }
  return isChat ? "দুঃখিত, এই মুহূর্তে আমার এআই ব্রেন কাজ করছে না।" : "SAFE";
}

client.once('ready', () => {
  console.log(`Bot connected as ${client.user.tag}`);
  console.log('Log Channel ID set to:', LOG_CHANNEL_ID);
  console.log('Multi-API Failover, Voice & Advanced AI Moderation active!');
});

// মেসেজ ইভেন্ট হ্যান্ডলার
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const content = message.content.trim();

  // ১. যদি মেসেজটি '!' দিয়ে শুরু হয়, তবে সেটি ভয়েস কমান্ড
  if (content.startsWith('!')) {
    await handleVoiceCommand(message);
    return;
  }

  // ২. শুধু বটের নিজস্ব আইডি মেনশন করা হয়েছে কি না তা নিখুঁতভাবে চেক করা 
  const isBotMentioned = message.mentions.users.has(client.user.id) && !message.mentions.everyone;

  if (isBotMentioned) {
    await handleMention(message, checkMessageWithAI);
    return;
  }

  // ৩. অটো মডারেশন লজিক (যে কোডটি আপনি জানতে চেয়েছেন সেটি এখানে বসবে)
  try {
    const moderationResult = await checkMessageModeration(content, aiProviders, axios);
    if (moderationResult !== "SAFE") {
      await handleModeration(message, moderationResult);
    }
  } catch (error) {
    console.error('Moderation check error:', error);
  }
});

client.login(DISCORD_TOKEN);
