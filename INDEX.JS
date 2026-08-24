const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');
const cron = require('node-cron');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages
  ]
});

const DISCORD_TOKEN = process.env.MTU0MTM5ODY4MDg0MDcwNDAyMA.GrV3oC.KkVmgS04tYDwetJOwAgqkUmmWbAVE7q7XHp3kM;
const NEWS_API_KEY = process.env.21944bf4fb5a4dc1ac40b983337c01dd;
const TARGET_CHANNEL_ID = '1541401479657554033';

async function sendDailyNews() {
  try {
    const channel = await client.channels.fetch(TARGET_CHANNEL_ID);
    if (!channel) return console.log('Channel not found.');

    const globalRes = await axios.get(
      `https://newsapi.org/v2/top-headlines?language=en&pageSize=5&apiKey=${NEWS_API_KEY}`
    );

    const bdRes = await axios.get(
      `https://newsapi.org/v2/everything?q=Bangladesh&sortBy=publishedAt&pageSize=5&apiKey=${NEWS_API_KEY}`
    );

    const globalArticles = globalRes.data.articles || [];
    const bdArticles = bdRes.data.articles || [];

    let responseMessage = '📢 **Daily News Update (8:00 PM)**\n\n🌍 **Top 5 World News:**\n';
    if (globalArticles.length > 0) {
      globalArticles.forEach((art, idx) => {
        responseMessage += `${idx + 1}. [${art.title}](${art.url})\n`;
      });
    } else {
      responseMessage += 'No world news available at the moment.\n';
    }

    responseMessage += '\n🇧🇩 **Top 5 Bangladesh News:**\n';
    if (bdArticles.length > 0) {
      bdArticles.forEach((art, idx) => {
        responseMessage += `${idx + 1}. [${art.title}](${art.url})\n`;
      });
    } else {
      responseMessage += 'No Bangladesh news available at the moment.\n';
    }

    await channel.send(responseMessage);
    console.log('Daily news successfully sent to the channel.');

  } catch (error) {
    console.error('Error fetching or sending news:', error);
  }
}

client.once('ready', () => {
  console.log(`Bot connected as ${client.user.tag}`);

  // Schedule task for 8:00 PM daily (Bangladesh Time)
  cron.schedule('0 20 * * *', () => {
    sendDailyNews();
  }, {
    timezone: "Asia/Dhaka"
  });
});

client.login(DISCORD_TOKEN);const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');
const cron = require('node-cron');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages
  ]
});

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const NEWS_API_KEY = process.env.NEWS_API_KEY;
const TARGET_CHANNEL_ID = '1541401479657554033';

async function sendDailyNews() {
  try {
    const channel = await client.channels.fetch(TARGET_CHANNEL_ID);
    if (!channel) return console.log('Channel not found.');

    const globalRes = await axios.get(
      `https://newsapi.org/v2/top-headlines?language=en&pageSize=5&apiKey=${NEWS_API_KEY}`
    );

    const bdRes = await axios.get(
      `https://newsapi.org/v2/everything?q=Bangladesh&sortBy=publishedAt&pageSize=5&apiKey=${NEWS_API_KEY}`
    );

    const globalArticles = globalRes.data.articles || [];
    const bdArticles = bdRes.data.articles || [];

    let responseMessage = '📢 **Daily News Update (8:00 PM)**\n\n🌍 **Top 5 World News:**\n';
    if (globalArticles.length > 0) {
      globalArticles.forEach((art, idx) => {
        responseMessage += `${idx + 1}. [${art.title}](${art.url})\n`;
      });
    } else {
      responseMessage += 'No world news available at the moment.\n';
    }

    responseMessage += '\n🇧🇩 **Top 5 Bangladesh News:**\n';
    if (bdArticles.length > 0) {
      bdArticles.forEach((art, idx) => {
        responseMessage += `${idx + 1}. [${art.title}](${art.url})\n`;
      });
    } else {
      responseMessage += 'No Bangladesh news available at the moment.\n';
    }

    await channel.send(responseMessage);
    console.log('Daily news successfully sent to the channel.');

  } catch (error) {
    console.error('Error fetching or sending news:', error);
  }
}

client.once('ready', () => {
  console.log(`Bot connected as ${client.user.tag}`);

  // Schedule task for 8:00 PM daily (Bangladesh Time)
  cron.schedule('0 20 * * *', () => {
    sendDailyNews();
  }, {
    timezone: "Asia/Dhaka"
  });
});

client.login(DISCORD_TOKEN);
