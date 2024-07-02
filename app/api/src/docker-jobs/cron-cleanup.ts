Deno.cron("Log a message", "* * * * *", () => {
  console.log("This will print once a minute.");
});