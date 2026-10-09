const { EmbedBuilder } = require('discord.js');
const { addWarning, getWarnings } = require('./database');

const TARGET_LOG_CHANNEL_ID = process.env.TARGET_LOG_CHANNEL_ID;
const ADMIN_USER_ID = process.env.ADMIN_USER_ID;

// সার্ভারের মডারেশন রুলস ও নির্দেশিকা (এআই-এর জন্য)
const SERVER_RULES_PROMPT = `
You are a strict Discord server moderator bot named 'BD E-SPORTS ORG'. 
Your job is to enforce server rules and maintain a clean, friendly environment.
Analyze the given message and check if it violates any rules.

Response rules:
- If the message is minor toxic/bad word, reply with: 'WARN'
- If it's heavily spamming, reply with: 'TIMEOUT'
- If it's extremely abusive, dangerous, or heavily toxic, reply with: 'KICK'
- If the message is completely normal and safe, reply with: 'SAFE'
- Reply with ONLY ONE WORD: WARN, TIMEOUT, KICK, or SAFE. No extra text.
`;

// ১. এআই দিয়ে মেসেজ মডারেশন চেক করার ফাংশন
async function checkMessageModeration(messageContent, aiProviders, axios) {
  for (let provider of aiProviders) {
    try {
      if (provider.type === "openrouter" || provider.type === "openai") {
        const apiUrl = provider.type === "openrouter" 
          ? 'https://openrouter.ai/api/v1/chat/completions' 
          : 'https://api.openai.com/v1/chat/completions';

        const response = await axios.post(
          apiUrl,
          {
            model: provider.model,
            messages: [
              { role: "system", content: SERVER_RULES_PROMPT },
              { role: "user", content: messageContent }
            ]
          },
          { headers: { 'Authorization': `Bearer ${provider.key}` } }
        );

        const reply = response.data.choices[0].message.content.trim().toUpperCase();
        return reply;
      }
    } catch (error) {
      console.warn(`Moderation API (${provider.name}) failed. Trying next...`);
    }
  }
  return "SAFE";
}

// ২. মডারেশন অ্যাকশন হ্যান্ডলার (অনারের ডাইরেক্ট কিক কমান্ড, এআই মডারেশন ও ওয়ার্নিং সিস্টেম)
async function handleModeration(message, moderationResult) {
  try {
    if (message.author.bot) return;

    const logChannel = await message.client.channels.fetch(TARGET_LOG_CHANNEL_ID).catch(() => null);

// ── অনারের ডাইরেক্ট কিক কমান্ড (নিখুঁত ও সুনির্দিষ্ট) ──
    if (message.content.toLowerCase().includes('kick')) {
      if (message.author.id === ADMIN_USER_ID) {
        // মেসেজ থেকে মেনশন করা প্রথম মেম্বারকে সরাসরি তুলে নেওয়া
        const targetMember = message.mentions.members.first();
        
        if (targetMember) {
          // নিজের বট বা নিজেকে কিক করার চেষ্টা আটকানো
          if (targetMember.id === message.client.user.id) {
            return message.reply('❌ আমি নিজেকে কিক করতে পারব না!');
          }
          if (targetMember.id === message.author.id) {
            return message.reply('❌ আপনি নিজেকে কিক করতে পারবেন না!');
          }

          if (!targetMember.kickable) {
            return message.reply('❌ এই সদস্যকে কিক করা সম্ভব নয়! হয়তো তার রোল আমার চেয়ে উপরে বা সে সার্ভার অনার।');
          }

          try {
            await message.delete().catch(() => {});
            await targetMember.kick('অনারের সরাসরি নির্দেশে চ্যাট কমান্ডের মাধ্যমে কিক করা হয়েছে।');
            
            const confirmMsg = await message.channel.send(`👢 ${targetMember.user.tag} কে সফলভাবে সার্ভার থেকে কিক করা হয়েছে!`);
            setTimeout(() => confirmMsg.delete().catch(() => {}), 5000);

            if (logChannel) {
              await logChannel.send(`👢 **Owner Direct Kick Command**\n• **Target:** ${targetMember.user.tag} (${targetMember.id})\n• **Kicked By Owner:** ${message.author}\n• **Channel:** <#${message.channel.id}>`);
            }
          } catch (err) {
            console.error('Kick execution failed:', err);
            message.reply('❌ কিক করতে গিয়ে একটি সমস্যা হয়েছে। বটের পারমিশন চেক করুন।');
          }
          return;
        }
      }
    }

    // স্বাভাবিক মেসেজ হলে খারাপ শব্দ বা স্প্যাম ডিলিট করা
    await message.delete().catch(() => {});

    // ── ৪. এআই নির্দেশিত ডাইরেক্ট কিক ──
    if (moderationResult === "KICK") {
      if (message.guild.members.me.permissions.has('KickMembers') && message.member && message.member.kickable) {
        await message.member.kick('মারাত্মক আপত্তিকর ভাষা বা গুরুতর নিয়ম লঙ্ঘনের কারণে সার্ভার থেকে কিক করা হয়েছে।');
        await message.channel.send(`👢 ${message.author} কে গুরুতর নিয়ম ভঙ্গের কারণে সার্ভার থেকে কিক করা হয়েছে!`);
      }

      if (logChannel) {
        await logChannel.send(`👢 **AI Instant Kick Log**\n• **User:** ${message.author} (${message.author.tag})\n• **Channel:** <#${message.channel.id}>\n• **Reason:** \`${message.content}\``);
      }
      return;
    }

    // ── ৫. ওয়ার্নিং লজিক (প্রথমবার ওয়ার্নিং, দ্বিতীয়বার অটো-কিক) ──
    if (moderationResult === "WARN") {
      addWarning(message.author.id, message.author.tag, async (err, count) => {
        if (err) return;

        if (count >= 2) {
          if (message.guild.members.me.permissions.has('KickMembers') && message.member && message.member.kickable) {
            await message.member.kick('এর আগেও সতর্ক করার পরও পুনরায় নিয়ম ভাঙার কারণে কিক করা হয়েছে।');
            await message.channel.send(`👢 ${message.author}, আপনাকে এর আগেও সতর্ক করা হয়েছিল। বারবার নিয়ম অমান্য করায় এখন সার্ভার থেকে কিক করা হলো!`);
          }

          if (logChannel) {
            await logChannel.send(`👢 **Kick Log (Repeated Warning)**\n• **User:** ${message.author} (${message.author.tag})\n• **Action:** Kicked due to multiple warnings (${count} warnings)`);
          }
        } else {
          const warnMsg = await message.channel.send(`⚠️ ${message.author}, সার্ভারে শালীনতা বজায় রাখুন! এটি আপনার সতর্কবার্তা #${count}। **পরবর্তীতে যদি আবার এরকম কিছু করেন, তাহলে সরাসরি সার্ভার থেকে কিক মারা হবে!**`);
          setTimeout(() => warnMsg.delete().catch(() => {}), 8000);

          if (logChannel) {
            await logChannel.send(`⚠️ **Warning Log**\n• **User:** ${message.author} (${message.author.tag})\n• **Count:** ${count}\n• **Message:** \`${message.content}\``);
          }
        }
      });
    } 
    // ── ৬. স্প্যাম প্রোটেকশন (টাইমআউট) ──
    else if (moderationResult === "TIMEOUT") {
      if (message.guild.members.me.permissions.has('ModerateMembers') && message.member && message.member.moderatable) {
        await message.member.timeout(10 * 60 * 1000, 'অতিরিক্ত স্প্যাম বা আপত্তিকর মেসেজ পাঠানোর কারণে অটো-টাইমআউট করা হয়েছে।');
        await message.channel.send(`🔇 ${message.author} কে অতিরিক্ত স্প্যাম করার কারণে ১০ মিনিটের জন্য টাইমআউট করা হয়েছে!`);
      }

      if (logChannel) {
        await logChannel.send(`🔇 **Timeout Log**\n• **User:** ${message.author} (${message.author.tag})\n• **Channel:** <#${message.channel.id}>`);
      }
    }
  } catch (error) {
    console.error('Moderation Execution Error:', error);
  }
}

module.exports = { checkMessageModeration, handleModeration };
