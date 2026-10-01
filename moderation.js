const { joinVoiceChannel, getVoiceConnection, createAudioPlayer, createAudioResource } = require('@discordjs/voice');
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const play = require('play-dl');

// সার্চ রেজাল্ট সাময়িকভাবে সেভ রাখার জন্য একটি ম্যাপ
const searchCache = new Map();

// ১. ভয়েস চ্যানেল এবং ইন্টারেক্টিভ প্লে কমান্ড হ্যান্ডলার
async function handleVoiceCommand(message) {
  if (message.author.bot) return;

  const args = message.content.trim().split(' ');
  const command = args[0];
  const query = args.slice(1).join(' ');

  // !join কমান্ড
  if (command === '!join') {
    const channel = message.member.voice.channel;
    if (!channel) {
      return message.reply('⚠️ প্রথমে আপনাকে যেকোনো একটি ভয়েস চ্যানেলে যুক্ত হতে হবে!');
    }

    try {
      joinVoiceChannel({
        channelId: channel.id,
        guildId: message.guild.id,
        adapterCreator: message.guild.voiceAdapterCreator,
      });
      message.reply(`✅ সফলভাবে যুক্ত হয়েছি: **${channel.name}** ভয়েস চ্যানেলে!`);
    } catch (error) {
      console.error('Voice Join Error:', error);
      message.reply('❌ ভয়েস চ্যানেলে যুক্ত হতে সমস্যা হয়েছে।');
    }
  }

  // !play কমান্ড (ইন্টারেক্টিভ বক্স ও সিলেক্ট মেনু সহ)
  if (command === '!play') {
    const channel = message.member.voice.channel;
    if (!channel) {
      return message.reply('⚠️ গান শুনতে হলে প্রথমে আপনাকে যেকোনো একটি ভয়েস চ্যানেলে যুক্ত হতে হবে!');
    }

    if (!query) {
      return message.reply('⚠️ অনুগ্রহ করে গানের নাম লিখুন! যেমন: `!play বন্দে মায়া লাগাইছে`');
    }

    try {
      await message.channel.send(`🔍 **${query}** এর জন্য গান খোঁজা হচ্ছে...`);

      // ইউটিউব থেকে সার্চ করে ৫টি রেজাল্ট আনা
      const searchResults = await play.search(query, { limit: 5 });
      if (!searchResults || searchResults.length === 0) {
        return message.reply('❌ দুঃখিত, এই নামে কোনো গান খুঁজে পাওয়া যায়নি!');
      }

      // ইউনিক আইডি তৈরি করে সার্চ রেজাল্ট ক্যাশ করে রাখা
      const searchId = `${message.author.id}_${Date.now()}`;
      searchCache.set(searchId, searchResults);

      // এমবেড বক্স তৈরি
      const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('🎶 মিউজিক সিলেক্ট করুন')
        .setDescription(`আপনার সার্চ করা **"${query}"** এর জন্য নিচের ড্রপডাউন মেনু থেকে একটি গান সিলেক্ট করুন:`)
        .setTimestamp();

      // ড্রপডাউন মেনু অপশন তৈরি
      const options = searchResults.map((song, index) => ({
        label: song.title.length > 95 ? song.title.substring(0, 92) + '...' : song.title,
        description: `সময়: ${song.duration || 'N/A'}`,
        value: `${searchId}_${index}`,
      }));

      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('select_song')
          .setPlaceholder('🎵 এখানে ক্লিক করে গান পছন্দ করুন...')
          .addOptions(options)
      );

      // মেসেজ পাঠানো
      const sentMessage = await message.reply({ embeds: [embed], components: [row] });

      // ইউজারের ক্লিক করার জন্য కలেক্টর (Collector) তৈরি (৬০ সেকেন্ড সময়)
      const collector = sentMessage.createMessageComponentCollector({ time: 60000 });

      collector.on('collect', async (interaction) => {
        if (interaction.user.id !== message.author.id) {
          return interaction.reply({ content: '⚠️ এই মেনুটি শুধু যে কমান্ড দিয়েছে সে ব্যবহার করতে পারবে!', ephemeral: true });
        }

        await interaction.update({ content: '⏳ গান লোড করা হচ্ছে, একটু অপেক্ষা করুন...', embeds: [], components: [] });

        try {
          let connection = getVoiceConnection(message.guild.id);
          if (!connection) {
            connection = joinVoiceChannel({
              channelId: channel.id,
              guildId: message.guild.id,
              adapterCreator: message.guild.voiceAdapterCreator,
            });
          }

          const [sId, sIndex] = interaction.values[0].split('_');
          const cachedResults = searchCache.get(sId);

          if (!cachedResults || !cachedResults[sIndex]) {
            return interaction.editReply('❌ গানের ডাটা খুঁজে পাওয়া যায়নি বা মেয়াদ শেষ হয়ে গেছে। আবার `!play` দিন।');
          }

          const songUrl = cachedResults[sIndex].url;
          const songTitle = cachedResults[sIndex].title;

          const streamInfo = await play.stream(songUrl);
          if (!streamInfo || !streamInfo.stream) {
            return interaction.editReply('❌ এই গানটির অডিও স্ট্রিম লোড করা সম্ভব হয়নি।');
          }

          const player = createAudioPlayer();
          const resource = createAudioResource(streamInfo.stream, { inputType: streamInfo.type });

          player.play(resource);
          connection.subscribe(player);

          await interaction.editReply(`🎶 সফলভাবে বাজানো শুরু হয়েছে: **${songTitle}**`);

          // ব্যবহার শেষে ক্যাশ থেকে ডিলিট করে দেওয়া
          searchCache.delete(sId);

        } catch (err) {
          console.error('Selection Play Error:', err);
          await interaction.editReply('❌ গান বাজাতে গিয়ে ইউটিউব রেস্ট্রিকশন বা অন্য কোনো সমস্যা হয়েছে।');
        }
      });

      collector.on('end', (collected) => {
        if (collected.size === 0) {
          sentMessage.edit({ content: '⏰ সময় শেষ! আপনি কোনো গান সিলেক্ট করেননি।', embeds: [], components: [] }).catch(() => {});
        }
      });

    } catch (error) {
      console.error('Play Command Error:', error);
      message.reply('❌ গান সার্চ করতে গিয়ে একটি সমস্যা হয়েছে।');
    }
  }

  // !leave কমান্ড
  if (command === '!leave') {
    const connection = getVoiceConnection(message.guild.id);
    if (!connection) {
      return message.reply('⚠️ আমি এই মুহূর্তে কোনো ভয়েস চ্যানেলে নেই!');
    }

    try {
      connection.destroy();
      message.reply('👋 ভয়েস চ্যানেল থেকে ডিসকানেক্ট হয়েছি!');
    } catch (error) {
      console.error('Voice Leave Error:', error);
      message.reply('❌ ভয়েস চ্যানেল থেকে বের হতে সমস্যা হয়েছে।');
    }
  }
}

// ২. মেনশন করলে এআই দিয়ে রিপ্লাই দেওয়ার ফাংশন (আপডেট করা)
async function handleMention(message, checkMessageWithAI) {
  if (message.author.bot) return;

  // নিখুঁতভাবে চেক করা যেন @everyone বা অন্য কারো মেনশন বট না ধরে, শুধু সরাসরি বটকে ট্যাগ করলেই কাজ করে
  const isBotMentioned = message.mentions.users.has(message.client.user.id) && !message.mentions.everyone;

  if (isBotMentioned) {
    const cleanContent = message.content.replace(/<@!?\d+>/g, '').trim();
    
    if (!cleanContent) {
      return message.reply('জি বলুন, আমি কীভাবে আপনাকে সাহায্য করতে পারি?');
    }

    await message.channel.sendTyping();

    try {
      const aiReply = await checkMessageWithAI(cleanContent, true);
      await message.reply(aiReply || 'দুঃখিত, এই মুহূর্তে আমি উত্তর দিতে পারছি না।');
    } catch (error) {
      console.error('AI Mention Error:', error);
      message.reply('এআই ব্রেনের সাথে সংযোগ করতে সমস্যা হচ্ছে।');
    }
  }
}

module.exports = { handleVoiceCommand, handleMention };
