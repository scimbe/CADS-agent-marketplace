import http from 'node:http';
let n = 0;
http.createServer((q, s) => { let b = ''; q.on('data', (c) => b += c); q.on('end', () => {
  n++; const j = JSON.parse(b), sys = j.messages[0].content;
  const c = sys.includes('rap hook') ? { title: 'Pizza Beat', lines: ['Pizza heiss', 'Ich zahl den Preis', 'Kaese im Kreis', 'Das ist der Beweis'] }
    : sys.includes('meme') ? { options: [{ top: 'Wenn der Hund', bottom: 'Chef spielt' }, { top: 'Montag', bottom: 'Immer noch' }, { top: 'Ich', bottom: 'Auch ich' }] }
    : { options: ['KI sagt Keks ' + n, 'Montag kann warten ' + n, 'Heute Frosch ' + n] };
  s.writeHead(200, { 'Content-Type': 'application/json' }); s.end(JSON.stringify({ model: j.model, thinking: j.chat_template_kwargs, choices: [{ message: { content: JSON.stringify(c) } }] }));
}); }).listen(18771, '127.0.0.1');
