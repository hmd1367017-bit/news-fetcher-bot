const { joinVoiceChannel, getVoiceConnection } = require('@discordjs/voice');

// ভয়েস চ্যানেল এবং প্রম্পট জেনারেটর হ্যান্ডলার
async function handleVoiceCommand(message, checkMessageWithAI) {
  if (message.author.bot) return;

  const content = message.content.trim();
  const args = content.split(' ');
  const command = args[0].toLowerCase();

  // ১. !join কমান্ড
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
    return;
  }

  // ২. !leave কমান্ড
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
    return;
  }
}

module.exports = { handleVoiceCommand };
