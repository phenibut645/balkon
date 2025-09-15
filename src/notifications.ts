import { TwitchHandler } from "./utils/TwitchHandler.js";

async function checkStream() {
    const twitchHandler = TwitchHandler.getInstance();
  const live = await twitchHandler.isLive("pr1smoo");

  if (live ) {
    console.log("🎉 Стример только что вышел в эфир!");
  }
}

setInterval(checkStream, 30_000); // каждые 30 секунд
