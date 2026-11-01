/* Live notification push (Server-Sent Events).
   Each signed-in browser keeps one open stream; when a notification row is saved the server
   sends a tiny "refresh" event and the page re-fetches its own list straight away. */
const streams = new Set();

function addStream(userId, res) {
  const stream = { userId, res };
  streams.add(stream);
  const beat = setInterval(() => { try { res.write(': keep-alive\n\n'); } catch (_) { /* closed */ } }, 25000);
  res.on('close', () => { clearInterval(beat); streams.delete(stream); });
}

/* Tells every open page to re-read its notifications. Each page only ever receives its own rows from GET /notifications. */
function pingAll() {
  for (const { res } of streams) {
    try { res.write('event: refresh\ndata: {}\n\n'); } catch (_) { /* closed */ }
  }
}

module.exports = { addStream, pingAll };