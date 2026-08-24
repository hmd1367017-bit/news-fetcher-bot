const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');
const cron = require('node-cron');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const NEWS_API_KEY = process.env.NEWS_API_KEY;

// আপনার নির্দিষ্ট টেক্সট চ্যানেলের আইডি
const TARGET_CHANNEL_ID = '1541417897914261751';

async function sendDailyNews() {
  try {
    const channel = await client.channels.fetch(TARGET_CHANNEL_ID);
    if (!channel) return console.log('Channel not found.');

    // 1. Top 5 Asia News
    const asiaRes = await axios.get(
      `https://newsapi.org/v2/everything?q=Asia&sortBy=publishedAt&pageSize=5&apiKey=${NEWS_API_KEY}`
    );

    // 2. Top 5 Bangladesh News
    const bdRes = await axios.get(
      `https://newsapi.org/v2/everything?q=Bangladesh&sortBy=publishedAt&pageSize=5&apiKey=${NEWS_API_KEY}`
    );

    const asiaArticles = asiaRes.data.articles || [];
    const bdArticles = bdRes.data.articles || [];

    let responseMessage = "**Daily Morning News Update**\n\n";

    if (asiaArticles.length > 0) {
      asiaArticles.forEach((art, idx) => {
        responseMessage += `${idx + 1}. **${art.title}**\n${art.url}\n\n`;
      });
    } else {
      responseMessage += "No Asia news available at the moment.\n\n";
    }

    responseMessage += "**Top 5 Bangladesh News:**\n";
    if (bdArticles.length > 0) {
      bdArticles.forEach((art, idx) => {
        responseMessage += `${idx + 1}. **${art.title}**\n${art.url}\n\n`;
      });
    } else {
      responseMessage += "No Bangladesh news available at the moment.\n";
    }

    await channel.send(responseMessage);
    console.log('Morning news successfully sent.');
  } catch (error) {
    console.error('Error fetching or sending news:', error);
  }
}

client.once('ready', () => {
  console.log(`Bot connected as ${client.user.tag}`);

  // প্রতিদিন সকাল ৭:০০ টায় অটোমেটিক নিউজ পাঠাবে
  cron.schedule('0 7 * * *', () => {
    sendDailyNews();
  }, {
    timezone: "Asia/Dhaka"
  });
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  // শুধু নির্দিষ্ট চ্যানেলে !news লিখলে কাজ করবে
  if (message.channel.id === TARGET_CHANNEL_ID && message.content.toLowerCase().includes('!news')) {
    sendDailyNews();
  }
});

client.login(DISCORD_TOKEN);

const express = require('express');
const app = express();

// Render Environment variable থেকে Port নেওয়া (ডিফল্ট 3000)
const PORT = process.env.PORT || 3000;

// Render-এর হেলথ চেকের জন্য रूट এন্ডপয়েন্ট
app.get('/', (req, res) => {
  res.send('Bot is running live!');
});

app.listen(PORT, () => {
  console.log(`HTTP Server running on port ${PORT}`);
});
