// WordNetLoader.js

/**
 * WordNetLoader is responsible for loading and parsing WordNet JSON files in a purely
 * browser-based environment (e.g., GitHub Pages).
 *
 * Instead of using 'fs' from Node.js, we use 'fetch' to retrieve each JSON file.
 */

const WORDNET_FOLDER = 'Data/WordNet'; // relative path if your JSON files are in Data/WordNet/
const SYNSET_FILES = [
  'adj.all.json',
  'adj.pert.json',
  'adj.ppl.json',
  'adv.all.json',
  'noun.Tops.json',
  'noun.act.json',
  'noun.animal.json',
  'noun.artifact.json',
  'noun.attribute.json',
  'noun.body.json',
  'noun.cognition.json',
  'noun.communication.json',
  'noun.event.json',
  'noun.feeling.json',
  'noun.food.json',
  'noun.group.json',
  'noun.location.json',
  'noun.motive.json',
  'noun.object.json',
  'noun.person.json',
  'noun.phenomenon.json',
  'noun.plant.json',
  'noun.possession.json',
  'noun.process.json',
  'noun.quantity.json',
  'noun.relation.json',
  'noun.shape.json',
  'noun.state.json',
  'noun.substance.json',
  'verb.body.json',
  'verb.change.json',
  'verb.cognition.json',
  'verb.communication.json',
  'verb.competition.json',
  'verb.consumption.json',
  'verb.contact.json',
  'verb.creation.json',
  'verb.emotion.json',
  'verb.motion.json',
  'verb.perception.json',
  'verb.possession.json',
  'verb.social.json',
  'verb.stative.json',
  'verb.weather.json'
];

const ENTRY_FILES = [
  'entries-0.json',
  'entries-a.json',
  'entries-b.json',
  'entries-c.json',
  'entries-d.json',
  'entries-e.json',
  'entries-f.json',
  'entries-g.json',
  'entries-h.json',
  'entries-i.json',
  'entries-j.json',
  'entries-k.json',
  'entries-l.json',
  'entries-m.json',
  'entries-n.json',
  'entries-o.json',
  'entries-p.json',
  'entries-q.json',
  'entries-r.json',
  'entries-s.json',
  'entries-t.json',
  'entries-u.json',
  'entries-v.json',
  'entries-w.json',
  'entries-x.json',
  'entries-y.json',
  'entries-z.json'
];

/**
 * Loads a single JSON file from Data/WordNet via fetch, returning the parsed object.
 * @param {string} filename - e.g. 'adj.all.json'
 * @returns {Promise<Object>}
 */
async function fetchJSONFile(filename) {
  const url = `${WORDNET_FOLDER}/${filename}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

/**
 * Loads all synset files and creates a mapping from synset IDs to { pos, definitions }.
 * @returns {Promise<Object>} - e.g. { "00001740-a": { pos: "a", definitions: [ ... ] }, ... }
 */
async function loadSynsetMappings() {
  const synsetMappings = {};

  // Fetch all synset files in parallel
  const filePromises = SYNSET_FILES.map(f => fetchJSONFile(f));
  const fileDataArray = await Promise.all(filePromises);

  // Each fileData is an object keyed by synsetId
  for (let i = 0; i < fileDataArray.length; i++) {
    const synsetData = fileDataArray[i];
    const filename = SYNSET_FILES[i];

    for (const synsetId in synsetData) {
      const synset = synsetData[synsetId];
      const pos = synset.partOfSpeech || inferPOSFromFilename(filename);
      const definitions = synset.definition || [];

      if (!synsetMappings[synsetId]) {
        synsetMappings[synsetId] = {
          pos,
          definitions: []
        };
      }
      synsetMappings[synsetId].definitions.push(...definitions);
    }
    console.log(`Loaded synset data from ${filename}`);
  }

  return synsetMappings;
}

/**
 * Guesses part of speech from filename, if not explicitly set in the JSON.
 */
function inferPOSFromFilename(filename) {
  if (filename.startsWith('adj')) return 'a';
  if (filename.startsWith('noun')) return 'n';
  if (filename.startsWith('verb')) return 'v';
  if (filename.startsWith('adv')) return 'r';
  return 'unknown';
}

/**
 * Loads all 'entry' files and maps words to their synsets and parts of speech.
 * @returns {Promise<Object>} - e.g. { "apple": [ { pos: "n", synsetIds: [ ... ] } ], ... }
 */
async function loadWordEntries() {
  const wordEntries = {};

  const filePromises = ENTRY_FILES.map(f => fetchJSONFile(f));
  const fileDataArray = await Promise.all(filePromises);

  for (let i = 0; i < fileDataArray.length; i++) {
    const entriesData = fileDataArray[i];
    const filename = ENTRY_FILES[i];

    for (const word in entriesData) {
      const posData = entriesData[word];
      for (const pos in posData) {
        const senses = posData[pos].sense || [];
        const synsetIds = senses.map(s => s.synset).filter(Boolean);

        if (!wordEntries[word]) {
          wordEntries[word] = [];
        }
        wordEntries[word].push({ pos, synsetIds });
      }
    }
    console.log(`Loaded entry data from ${filename}`);
  }

  return wordEntries;
}

/**
 * Combines word entries with synset definitions to form the final dictionary.
 * finalDictionary[word] = [ { pos: 'n', definitions: [ ... ] }, ... ]
 */
function createFinalDictionary(wordEntries, synsetMappings) {
  const finalDictionary = {};

  for (const word in wordEntries) {
    const entries = wordEntries[word];
    for (const entry of entries) {
      const { pos, synsetIds } = entry;
      for (const synsetId of synsetIds) {
        const synset = synsetMappings[synsetId];
        if (synset && synset.definitions.length > 0) {
          const lowerWord = word.toLowerCase();
          if (!finalDictionary[lowerWord]) {
            finalDictionary[lowerWord] = [];
          }
          finalDictionary[lowerWord].push({
            pos: synset.pos,
            definitions: synset.definitions
          });
        } else {
          console.warn(`No definitions found for synset ID "${synsetId}" (Word: ${word})`);
        }
      }
    }
  }

  return finalDictionary;
}

/**
 * Orchestrates the entire loading of WordNet data (synsets + entries) in a browser environment.
 */
export async function loadWordNetDictionary() {
  console.log("Loading synset mappings...");
  const synsetMappings = await loadSynsetMappings();

  console.log("Loading word entries...");
  const wordEntries = await loadWordEntries();

  console.log("Combining data into final dictionary...");
  const finalDictionary = createFinalDictionary(wordEntries, synsetMappings);

  console.log("WordNet dictionary successfully loaded.");
  return finalDictionary;
}
