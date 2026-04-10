module.exports = {
  apps: [
    {
      name: "balkon-bot",
      script: "dist/bot.js",
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "prod"
      }
    }
  ]
};