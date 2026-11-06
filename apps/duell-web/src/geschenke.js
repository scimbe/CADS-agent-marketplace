/* Gift ideas without AI (Katalog v2: geschenk-finder, biz-wichtel-ideen). A fixed list; each idea carries the budget it fits
   in euros (the app filters by it and never names a price), what it suits and for whom. Five ideas per question: likes
   first, then the order from the seed in the link, the same on every phone; nothing is weighted for or against anyone.
   The optional AI (kind liste) only adds texts; fromAi() cleans them like every text in a link and drops what a gift for
   a colleague or a child should not be (drink, body, diet, gambling). Part turnzwei; pure logic, also for node tests.
   The words only the part's widgets show (labels of the questions, the wish list's buttons) come with it (geschenke.json)
   and join the turn texts language by language, like office.js does. */
(function (root) {
  "use strict";
  var node = typeof module !== "undefined" && module.exports;
  var C = node ? require("./core.js") : root.DuellCore, Q = node ? require("./quest.js") : root.Quest, Tn = node ? require("./turns.js") : root.Turns;
  var TEXT = node ? require("./geschenke.json") : root.GeschenkeData;
  Object.keys(TEXT).forEach(function (l) { Object.assign(Tn.T(l), TEXT[l]); });
  var LANGS = ["de", "en"], MAX = 40, N = 5;
  // [de, en, euros, likes, for whom]: k child, t teen, a adult, o grandparent, b colleague (fits an office)
  var LIST = [
    ["Tee-Probierset", "Tea tasting set", 10, "tee", "aob"], ["Kaffeebohnen aus der Rösterei", "Coffee beans from a roastery", 15, "tee", "aob"],
    ["Schöne Tasse", "A nice mug", 10, "tee gemuet", "taob"], ["Thermobecher", "Travel mug", 15, "tee reisen sport", "tab"],
    ["Teesieb mit Teedose", "Tea strainer and caddy", 15, "tee", "aob"], ["Heiße Schokolade am Stiel", "Hot chocolate on a stick", 5, "suess tee", "ktaob"],
    ["Kleine Sukkulente", "Small succulent", 5, "pflanze", "taob"], ["Kräutertöpfe fürs Fenster", "Herb pots for the window", 10, "pflanze kochen", "aob"],
    ["Blumenzwiebeln im Glas", "Flower bulbs in a jar", 10, "pflanze", "aob"], ["Saatgut-Set", "Seed set", 5, "pflanze", "kaob"],
    ["Mini-Gewächshaus", "Mini greenhouse", 20, "pflanze", "kao"], ["Gartenhandschuhe", "Gardening gloves", 15, "pflanze sport", "ao"],
    ["Schreibtischpflanze im Topf", "Desk plant in a pot", 15, "pflanze", "ab"], ["Futterhaus für Vögel", "Bird feeder", 15, "pflanze", "kao"],
    ["Notizbuch", "Notebook", 10, "lesen", "taob"], ["Lesezeichen aus Holz", "Wooden bookmark", 5, "lesen", "taob"],
    ["Taschenbuch aus der Buchhandlung", "A paperback from a bookshop", 15, "lesen", "taob"], ["Leselampe zum Anklemmen", "Clip-on reading light", 15, "lesen technik", "taob"],
    ["Bilderbuch zum Vorlesen", "Picture book to read aloud", 15, "lesen", "k"], ["Gutschein für die Buchhandlung", "Bookshop voucher", 20, "lesen", "taob"],
    ["Guter Kugelschreiber", "A good pen", 10, "lesen", "aob"], ["Haftnotizen in Formen", "Shaped sticky notes", 5, "lesen basteln", "tb"],
    ["Comic", "Comic book", 10, "lesen", "kt"], ["Lupe zum Lesen", "Reading magnifier", 15, "lesen technik", "o"],
    ["Gewürzmischung", "Spice blend", 10, "kochen", "aob"], ["Backmischung im Glas", "Baking mix in a jar", 10, "kochen suess", "taob"],
    ["Ausstechformen", "Cookie cutters", 5, "kochen basteln", "ktaob"], ["Kochbuch", "Cookbook", 20, "kochen lesen", "tao"],
    ["Gutes Olivenöl", "Good olive oil", 15, "kochen", "aob"], ["Kochlöffel aus Holz", "Wooden spoons", 10, "kochen", "ao"],
    ["Brotdose", "Lunch box", 10, "kochen", "ktb"], ["Gutschein: Ich koche für dich", "Voucher: I'll cook for you", 5, "kochen", "ao"],
    ["Kartenspiel", "Card game", 10, "spiel", "ktaob"], ["Würfelspiel", "Dice game", 10, "spiel", "ktaob"],
    ["Rätselheft", "Puzzle book", 5, "spiel lesen", "taob"], ["Puzzle mit 500 Teilen", "500-piece jigsaw", 15, "spiel gemuet", "tao"],
    ["Brettspiel", "Board game", 30, "spiel", "ktao"], ["Knobelspiel aus Holz", "Wooden brain teaser", 10, "spiel", "ktaob"],
    ["Kartenspiel für unterwegs", "Travel card game", 5, "spiel reisen", "ktab"], ["Sudoku-Block", "Sudoku pad", 5, "spiel", "aob"],
    ["Rätselheft in großer Schrift", "Large-print puzzle book", 5, "spiel lesen", "o"], ["Seifenblasen", "Bubble wand", 5, "spiel sport", "k"],
    ["Kopfhörer-Etui", "Headphone case", 10, "musik technik reisen", "tab"], ["Liederbuch", "Song book", 15, "musik", "kao"],
    ["Mundharmonika", "Harmonica", 20, "musik", "kta"], ["Rassel-Eier", "Shaker eggs", 5, "musik", "k"],
    ["Gutschein für ein Konzert", "Concert voucher", 50, "musik", "ta"], ["Einfache Kopfhörer", "Simple headphones", 20, "musik technik", "ta"],
    ["Malbuch", "Colouring book", 5, "basteln", "kao"], ["Buntstifte", "Coloured pencils", 10, "basteln", "kta"],
    ["Knete", "Modelling clay", 5, "basteln", "k"], ["Origami-Papier", "Origami paper", 5, "basteln", "ktab"],
    ["Strickset für den Anfang", "Beginner's knitting kit", 20, "basteln gemuet", "tao"], ["Aquarellfarben", "Watercolour paints", 15, "basteln", "ktao"],
    ["Stempelset", "Stamp set", 10, "basteln", "ktb"], ["Stickerheft", "Sticker book", 5, "basteln", "k"],
    ["Experimentierkasten", "Science kit", 30, "technik basteln", "kt"], ["Fotokalender, selbst gestaltet", "Homemade photo calendar", 20, "basteln gemuet", "ao"],
    ["Springseil", "Skipping rope", 5, "sport", "kta"], ["Frisbee", "Frisbee", 5, "sport", "ktab"],
    ["Trinkflasche", "Water bottle", 15, "sport reisen", "ktab"], ["Stirnlampe", "Head torch", 20, "sport reisen technik", "ta"],
    ["Federball-Set", "Badminton set", 15, "sport", "kta"], ["Fahrradlicht", "Bike light", 15, "sport technik", "ta"],
    ["Wanderführer für die Region", "Local walking guide", 15, "sport reisen lesen", "ao"],
    ["Kabel-Organizer", "Cable organiser", 10, "technik", "tab"], ["Handyhalter", "Phone stand", 10, "technik", "taob"],
    ["Kleine Powerbank", "Small power bank", 20, "technik reisen", "tab"], ["Kleiner Bluetooth-Lautsprecher", "Small Bluetooth speaker", 30, "technik musik", "ta"],
    ["Taschenlampe", "Torch", 10, "technik sport", "ktao"], ["Schreibtisch-Organizer", "Desk organiser", 15, "technik lesen", "ab"],
    ["Gepäckanhänger", "Luggage tag", 5, "reisen", "tab"], ["Nackenkissen für die Reise", "Travel neck pillow", 15, "reisen gemuet", "tao"],
    ["Weltkarte zum Rubbeln", "Scratch-off world map", 20, "reisen", "ta"], ["Reiseführer", "Travel guide", 20, "reisen lesen", "ao"],
    ["Gutschein für einen Ausflug", "Voucher for a day out", 5, "reisen gemuet", "ktao"],
    ["Kuschelsocken", "Cosy socks", 5, "gemuet", "ktaob"], ["Kerze im Glas", "Candle in a jar", 10, "gemuet", "aob"],
    ["Wärmflasche mit Bezug", "Hot-water bottle with cover", 15, "gemuet", "ktao"], ["Kuscheldecke", "Fleece blanket", 30, "gemuet", "ktao"],
    ["Kuscheltier", "Cuddly toy", 15, "gemuet", "k"], ["Fotoalbum", "Photo album", 15, "gemuet basteln", "ao"],
    ["Mini-Zen-Garten", "Mini zen garden", 10, "gemuet pflanze", "ab"], ["Kinogutschein", "Cinema voucher", 20, "gemuet", "ta"],
    ["Fair gehandelte Schokolade", "Fair-trade chocolate", 5, "suess", "ktaob"], ["Selbst gebackene Kekse", "Home-baked biscuits", 5, "suess kochen", "ktaob"],
    ["Glas mit Bonbons", "Jar of sweets", 10, "suess", "ktaob"], ["Honig vom Imker", "Honey from a beekeeper", 10, "suess kochen", "aob"]
  ];
  var WHO = { kind: "k", teen: "t", partner: "a", eltern: "a", oma: "o", freund: "a", kollege: "b" };
  // Not a gift here, whatever the AI says: drink, smoking, gambling, body and diet, underwear and innuendo.
  var NOT = /alkohol|(^|[^a-z])(wein|bier|sekt)|(wein|bier|sekt)($|[^a-z])|schnaps|likor|likoer|gin\b|whisk|rum\b|vodka|wodka|prosecco|zigar|tabak|vape|shisha|casino|wett|lotto|diat|diaet|abnehm|kalorie|waage|parfum|deo\b|dessous|unterwasche|unterwaesche|erotik|sex|wine|beer|liquor|spirit|cigar|tobacco|gambl|betting|diet|weight|scale|perfume|lingerie|underwear|erotic/;
  function col(lang) { var i = LANGS.indexOf(lang); return i < 0 ? 0 : i; }
  function fold(s) { return String(s).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss"); }
  // ask: { who, euro, likes: [key, key] } (turns.js giftGame) -> five texts in the language.
  function ideas(seed, ask, lang) {
    var f = WHO[ask.who] || "a", likes = ask.likes || [], r = C.mulberry32(C.hash32("gift|" + seed + "|" + ask.who + "|" + ask.euro + "|" + likes.join(",")));
    return LIST.filter(function (x) { return x[4].indexOf(f) >= 0 && x[2] <= ask.euro; }).map(function (x) {
      var hit = likes.filter(function (l) { return x[3].split(" ").indexOf(l) >= 0; }).length;
      return { x: x, s: hit * 4 + (x[2] * 2 >= ask.euro ? 1 : 0) + r() };
    }).sort(function (a, b) { return b.s - a.s; }).slice(0, N).map(function (o) { return o.x[col(lang)]; });
  }
  function ok(s) { return !NOT.test(fold(s)); }
  // The liste answer (posten[].n) -> at most five clean, new, harmless texts that fit a link.
  function fromAi(opt, lang) {
    var out = [], seen = {};
    ((opt && opt.posten) || []).forEach(function (p) {
      var t = Q.clean(p && p.n, MAX), k = Q.fold(t);
      if (out.length < N && t && k && !seen[k] && ok(t)) { seen[k] = 1; out.push(t); }
    });
    return out;
  }
  var api = { LIST: LIST, WHO: WHO, ideas: ideas, fromAi: fromAi, ok: ok, MAX: MAX };
  if (node) module.exports = api; else root.Geschenke = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
