const WebSocket = require("ws");
const ws = new WebSocket("ws://localhost:4001");
ws.on("open", function() {
  process.stdout.write("OPEN\n");
  ws.send(JSON.stringify({ type: "chat", prompt: "Say hi" }));
  process.stdout.write("SENT\n");
});
ws.on("message", function(data) {
  var msg = JSON.parse(data.toString());
  if (msg.type !== "full" && msg.type !== "diff" && msg.type !== "custom_commands") {
    process.stdout.write("MSG: " + msg.type + " " + JSON.stringify(msg).substring(0,200) + "\n");
  } else {
    process.stdout.write("SKIP: " + msg.type + "\n");
  }
  if (msg.type === "chat_complete" || msg.type === "chat_error") {
    ws.close();
  }
});
ws.on("error", function(e) { process.stdout.write("ERR: " + e.message + "\n"); });
ws.on("close", function() { process.stdout.write("CLOSED\n"); process.exit(0); });
setTimeout(function() { process.stdout.write("TIMEOUT\n"); process.exit(1); }, 45000);
