// WordNetLoader.js

// All 73 JSON files you mentioned, listed in a single array.
const WORDNET_JSON_FILES = [
  // Adjectives
  'Data/WordNet/adj.all.json',
  'Data/WordNet/adj.pert.json',
  'Data/WordNet/adj.ppl.json',

  // Adverbs
  'Data/WordNet/adv.all.json',

  // "entries-*" files 
  'Data/WordNet/entries-0.json',
  'Data/WordNet/entries-a.json',
  'Data/WordNet/entries-b.json',
  'Data/WordNet/entries-c.json',
  'Data/WordNet/entries-d.json',
  'Data/WordNet/entries-e.json',
  'Data/WordNet/entries-f.json',
  'Data/WordNet/entries-g.json',
  'Data/WordNet/entries-h.json',
  'Data/WordNet/entries-i.json',
  'Data/WordNet/entries-j.json',
  'Data/WordNet/entries-k.json',
  'Data/WordNet/entries-l.json',
  'Data/WordNet/entries-m.json',
  'Data/WordNet/entries-n.json',
  'Data/WordNet/entries-o.json',
  'Data/WordNet/entries-p.json',
  'Data/WordNet/entries-q.json',
  'Data/WordNet/entries-r.json',
  'Data/WordNet/entries-s.json',
  'Data/WordNet/entries-t.json',
  'Data/WordNet/entries-u.json',
  'Data/WordNet/entries-v.json',
  'Data/WordNet/entries-w.json',
  'Data/WordNet/entries-x.json',
  'Data/WordNet/entries-y.json',
  'Data/WordNet/entries-z.json',

  // Frames
  'Data/WordNet/frames.json',

  // Nouns
  'Data/WordNet/noun.Tops.json',
  'Data/WordNet/noun.act.json',
  'Data/WordNet/noun.animal.json',
  'Data/WordNet/noun.artifact.json',
  'Data/WordNet/noun.attribute.json',
  'Data/WordNet/noun.body.json',
  'Data/WordNet/noun.cognition.json',
  'Data/WordNet/noun.communication.json',
  'Data/WordNet/noun.event.json',
  'Data/WordNet/noun.feeling.json',
  'Data/WordNet/noun.food.json',
  'Data/WordNet/noun.group.json',
  'Data/WordNet/noun.location.json',
  'Data/WordNet/noun.motive.json',
  'Data/WordNet/noun.object.json',
  'Data/WordNet/noun.person.json',
  'Data/WordNet/noun.phenomenon.json',
  'Data/WordNet/noun.plant.json',
  'Data/WordNet/noun.possession.json',
  'Data/WordNet/noun.process.json',
  'Data/WordNet/noun.quantity.json',
  'Data/WordNet/noun.relation.json',
  'Data/WordNet/noun.shape.json',
  'Data/WordNet/noun.state.json',
  'Data/WordNet/noun.substance.json',
  'Data/WordNet/noun.time.json',

  // Verbs
  'Data/WordNet/verb.body.json',
  'Data/WordNet/verb.change.json',
  'Data/WordNet/verb.cognition.json',
  'Data/WordNet/verb.communication.json',
  'Data/WordNet/verb.competition.json',
  'Data/WordNet/verb.consumption.json',
  'Data/WordNet/verb.contact.json',
  'Data/WordNet/verb.creation.json',
  'Data/WordNet/verb.emotion.json',
  'Data/WordNet/verb.motion.json',
  'Data/WordNet/verb.perception.json',
  'Data/WordNet/verb.possession.json',
  'Data/WordNet/verb.social.json',
  'Data/WordNet/verb.stative.json',
  'Data/WordNet/verb.weather.json'
];

// We'll create two top-level maps in memory:
// 1) synsetsMap: keyed by "00001740-a", "00002098-a", etc.
//    -> stores { pos, definitions:[], examples:[], members:[], domain_topic:[], etc. }
// 2) aggregator: keyed by "word" -> array of { pos, definitions, examples, ... }

export async function loadWordNetDictionary() {
  // Step 1: fetch all files in parallel
  const fetchPromises = WORDNET_JSON_FILES.map(async (filePath) => {
    const response = await fetch(filePath);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${filePath} - ${response.statusText}`);
    }
    const data = await response.json();
    return { filePath, data };
  });

  const fileDataArray = await Promise.all(fetchPromises);

  // Step 2: We'll build these in memory
  const synsetsMap = {};   // { "00001740-a": { pos:"a", definitions:[], examples:[], ... } }
  const aggregator = {};   // { "able": [ { pos:"a", definitions:[], examples:[] }, ... ], ... }

  // Step 3: parse each file
  for (const { filePath, data } of fileDataArray) {
    // We'll do a naive guess: if top-level keys look like synset IDs, parse them into synsetsMap
    // if top-level keys look more like actual text words, parse them into aggregator.
    // In reality, for WordNet, it's more nuanced.

    for (const topKey in data) {
      const record = data[topKey];

      // 1) Check if topKey looks like "00001740-a" or "08970180-n"
      if (/^\d{8}[-][avnrs]$/.test(topKey)) {
        // This is a synset record from e.g. adj.all.json
        parseSynsetRecord(synsetsMap, topKey, record);
      }
      // 2) Otherwise, it might be an "entries" style record with a top-level word or phrase
      else {
        parseEntriesRecord(aggregator, synsetsMap, topKey, record);
      }
    }
  }

  // Step 4: aggregator now has partial info from "entries" files that cross-reference synsetsMap.
  // The parseEntriesRecord() function can fill in definitions/examples from synsetsMap by looking up each sense.

  // Step 5: Also parse "members" in synsetsMap? 
  // If the synset has "members": ["able"], we can push aggregator["able"] = ...
  // But we already do that in parseSynsetRecord, or we can do a second pass if needed.

  // (We can do a second pass to unify everything, if we want each "members" to appear in aggregator as well.)

  unifySynsetMembers(synsetsMap, aggregator);

  return aggregator;
}

/** 
 * Parse a single synset entry, e.g.:
 * {
 *   "attribute": [...],
 *   "definition": [...],
 *   "example": [...],
 *   "ili": "i1",
 *   "members": [ "able" ],
 *   "partOfSpeech": "a"
 * }
 */
function parseSynsetRecord(synsetsMap, synsetId, record) {
  // record might have fields like definition, example, partOfSpeech, members, etc.
  const pos = record.partOfSpeech || guessPOSfromSynsetID(synsetId);
  const definitions = Array.isArray(record.definition) ? record.definition : [];
  const examples = Array.isArray(record.example) ? record.example : [];

  synsetsMap[synsetId] = {
    pos,
    definitions,
    examples,
    members: record.members || [],
    // we can store other fields if needed:
    domain_topic: record.domain_topic || [],
    attribute: record.attribute || [],
    ili: record.ili || null
    // ...
  };
}

/**
 * Parse an "entries" style record. 
 * E.g. 
 * {
 *   "n": {
 *     "sense": [
 *       { "id": "'hood%1:14:01::", "synset": "08242255-n" }
 *     ]
 *   }
 * }
 * or it might contain "a", "v", "r", etc.
 *
 * We'll look up each sense's synset in synsetsMap to get full definitions.
 */
function parseEntriesRecord(aggregator, synsetsMap, topKey, record) {
  // topKey is the "word" or phrase (like "'hood", "able", etc.)
  // record might have { n: { sense: [ ... ] }, a: { sense: [ ... ] }, ... } or it might be more advanced

  // For each part-of-speech key (like 'n', 'v', 'a', 'r'):
  for (const posKey in record) {
    const objForThisPOS = record[posKey];
    if (!objForThisPOS || !Array.isArray(objForThisPOS.sense)) {
      continue;
    }

    // For each sense:
    for (const senseObj of objForThisPOS.sense) {
      // senseObj might look like { id: "'hood%1:14:01::", synset: "08242255-n" }
      const synsetId = senseObj.synset; // e.g. "08242255-n"
      // Look up that synset in synsetsMap
      if (synsetsMap[synsetId]) {
        // We can combine data
        addToAggregator(aggregator, topKey, synsetsMap[synsetId]);
      } else {
        // No direct match found in synsetsMap => partial data
        // Let's store a minimal entry or skip
        addToAggregator(aggregator, topKey, {
          pos: posKey,
          definitions: ["[Definition not found for synset " + synsetId + "]"],
          examples: []
        });
      }
    }
  }
}

/**
 * Adds the given synset data to aggregator[word].
 * Example aggregator record:
 *  aggregator["able"] = [
 *    { pos: "a", definitions: [...], examples: [...] },
 *    ...
 *  ]
 */
function addToAggregator(aggregator, rawWord, synsetData) {
  const word = rawWord.toLowerCase(); // normalize
  if (!aggregator[word]) {
    aggregator[word] = [];
  }

  // Check if there's already an entry with this pos & definitions
  // We might want to de-dupe. For now, we'll just push a new entry.
  aggregator[word].push({
    pos: synsetData.pos || 'u', // unknown
    definitions: synsetData.definitions || [],
    examples: synsetData.examples || []
  });
}

/**
 * Attempt to guess part of speech from a synset ID if not specified
 * e.g. "00001740-a" => "a", "08970180-n" => "n"
 */
function guessPOSfromSynsetID(synsetId) {
  const lastChar = synsetId.slice(-1);
  if (['n', 'v', 'a', 'r', 's'].includes(lastChar)) {
    return lastChar;
  }
  return 'u'; // unknown
}

/**
 * After we've built synsetsMap, we can unify any 'members' 
 * that didn't appear in the 'entries' files.
 * For example, adj.all.json might have: 
 * {
 *   "00001740-a": { "members": ["able"], "definitions":["..."], "pos":"a", ... }
 * }
 * But "able" might not appear in any 'entries-*.json' 
 * so aggregator["able"] won't exist. Let's fix that:
 */
function unifySynsetMembers(synsetsMap, aggregator) {
  for (const synsetId in synsetsMap) {
    const { pos, definitions, examples, members } = synsetsMap[synsetId];
    if (Array.isArray(members)) {
      for (const m of members) {
        const w = m.toLowerCase();
        if (!aggregator[w]) {
          aggregator[w] = [];
        }
        // If aggregator[w] doesn’t already contain this (pos, definitions), add it:
        // (You might want to check for duplicates. We'll just push to be safe.)
        aggregator[w].push({ pos, definitions, examples });
      }
    }
  }
}
