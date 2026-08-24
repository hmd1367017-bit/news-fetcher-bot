const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');

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

async function sendNewsAndExit() {
  try {
    const channel = await client.channels.fetch(TARGET_CHANNEL_ID);
    if (!channel) {
      console.log('Channel not found.');
      process.exit(1);
    }

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
    console.log('News successfully sent. Exiting...');
    
    // নিউজ পাঠানো শেষ হলে বট বন্ধ হয়ে যাবে
    process.exit(0);
  } catch (error) {
    console.error('Error fetching or sending news:', error);
    process.exit(1);
  }
}

client.once('ready', () => {
  console.log(`Bot connected as ${client.user.tag}`);
  // বট রান হওয়ার সাথে সাথেই নিউজ পাঠিয়ে বন্ধ হয়ে যাবে
  sendNewsAndExit();
});

client.login(DISCORD_TOKEN);
