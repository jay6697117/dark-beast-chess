module.exports = {
  apps: [
    {
      name: "dark-beast-chess-server",
      script: "server/index.js",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      env: {
        PORT: process.env.PORT || 3000,
      },
    },
  ],
};
