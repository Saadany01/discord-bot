const { Client, GatewayIntentBits } = require("discord.js");
const {
  joinVoiceChannel,
  VoiceConnectionStatus,
  entersState,
} = require("@discordjs/voice");
const express = require("express");

// ─── Configuration ───────────────────────────────────────────────────────────
const BOT_TOKEN = process.env.BOT_TOKEN;
const SERVER_ID = "1326625955338518568";
const VOICE_CHANNEL_ID = "1362746421975191772";

const EXPRESS_PORT = process.env.PORT || 3000;
const RECONNECT_DELAY_MS = 5000;
// ─────────────────────────────────────────────────────────────────────────────

if (!BOT_TOKEN) {
  console.error("ERROR: BOT_TOKEN environment variable is not set.");
  process.exit(1);
}

// ─── Express Health Check ─────────────────────────────────────────────────────
const app = express();

app.get("/", (req, res) => {
  res.send("Bot is alive");
});

app.listen(EXPRESS_PORT, () => {
  console.log(`Health check server running on port ${EXPRESS_PORT}`);
});
// ─────────────────────────────────────────────────────────────────────────────

// ─── Discord Client ───────────────────────────────────────────────────────────
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

let connection = null;

async function joinChannel() {
  const guild = client.guilds.cache.get(SERVER_ID);
  if (!guild) {
    console.error(`Guild not found: ${SERVER_ID}`);
    return;
  }

  const channel = guild.channels.cache.get(VOICE_CHANNEL_ID);
  if (!channel) {
    console.error(`Voice channel not found: ${VOICE_CHANNEL_ID}`);
    return;
  }

  console.log(`Joining voice channel: ${channel.name}`);

  connection = joinVoiceChannel({
    channelId: VOICE_CHANNEL_ID,
    guildId: SERVER_ID,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: true,
    selfMute: true,
  });

  // Wait until ready
  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
    console.log("Connected to voice channel.");
  } catch (err) {
    console.error("Failed to connect within 30s:", err);
    connection.destroy();
    connection = null;
    scheduleReconnect();
    return;
  }

  // Handle disconnects and reconnect automatically
  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    console.log("Disconnected from voice channel. Attempting to reconnect...");
    try {
      // Discord.js may auto-reconnect — wait briefly to see if it recovers
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
      ]);
      console.log("Reconnecting automatically...");
    } catch {
      // Auto-reconnect failed — destroy and rejoin manually
      console.log("Auto-reconnect failed. Rejoining manually...");
      connection.destroy();
      connection = null;
      scheduleReconnect();
    }
  });

  connection.on(VoiceConnectionStatus.Ready, () => {
    console.log("Voice connection is ready.");
  });

  connection.on("error", (err) => {
    console.error("Voice connection error:", err);
  });
}

function scheduleReconnect() {
  console.log(`Reconnecting in ${RECONNECT_DELAY_MS / 1000}s...`);
  setTimeout(() => {
    joinChannel().catch((err) => {
      console.error("Reconnect attempt failed:", err);
      scheduleReconnect();
    });
  }, RECONNECT_DELAY_MS);
}

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
  joinChannel().catch((err) => {
    console.error("Initial join failed:", err);
    scheduleReconnect();
  });
});

client.on("error", (err) => {
  console.error("Discord client error:", err);
});

client.login(BOT_TOKEN);
