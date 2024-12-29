// WordNetLoader.js

/**
 * WordNetLoader is responsible for loading and parsing all WordNet JSON files.
 * It creates a comprehensive dictionary mapping words to their parts of speech and definitions.
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml'; // If JSON files need YAML parsing, otherwise remove.

const WORDNET_FOLDER = path.join('Data', 'WordNet');
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
 * Asynchronously reads and parses a JSON file.
 * @param {string} filePath - Path to the JSON file.
 * @returns {Promise<Object>} - Parsed JSON object.
 */
async function readJSONFile(filePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) {
        console.error(`Error reading file ${filePath}:`, err);
        return reject(err);
      }
      try {
        const jsonData = JSON.parse(data);
        resolve(jsonData);
      } catch (parseErr) {
        console.error(`Error parsing JSON from file ${filePath}:`, parseErr);
        reject(parseErr);
      }
    });
  });
}

/**
 * Loads all synset files and creates a synset mapping.
 * @returns {Promise<Object>} - Mapping from synset ID to { pos, definitions }.
 */
async function loadSynsetMappings() {
  const synsetMappings = {};

  for (const synsetFile of SYNSET_FILES) {
    const filePath = path.join(WORDNET_FOLDER, synsetFile);
    try {
      const synsetData = await readJSONFile(filePath);
      
      for (const synsetId in synsetData) {
        const synset = synsetData[synsetId];
        const pos = synset.partOfSpeech || inferPOSFromFilename(synsetFile);
        const definitions = synset.definition || [];

        if (!synsetMappings[synsetId]) {
          synsetMappings[synsetId] = {
            pos,
            definitions: []
          };
        }

        synsetMappings[synsetId].definitions.push(...definitions);
      }

      console.log(`Loaded synset data from ${synsetFile}`);
    } catch (error) {
      console.error(`Failed to load synset file ${synsetFile}:`, error);
    }
  }

  return synsetMappings;
}

/**
 * Infers part of speech from the synset filename.
 * @param {string} filename - Synset filename.
 * @returns {string} - Part of speech ('a', 'n', 'v', 'r').
 */
function inferPOSFromFilename(filename) {
  if (filename.startsWith('adj')) return 'a';
  if (filename.startsWith('noun')) return 'n';
  if (filename.startsWith('verb')) return 'v';
  if (filename.startsWith('adv')) return 'r';
  return 'unknown';
}

/**
 * Loads all entry files and maps words to their synsets and parts of speech.
 * @returns {Promise<Object>} - Mapping from word to array of { pos, synsetIds }.
 */
async function loadWordEntries() {
  const wordEntries = {};

  for (const entryFile of ENTRY_FILES) {
    const filePath = path.join(WORDNET_FOLDER, entryFile);
    try {
      const entriesData = await readJSONFile(filePath);

      for (const word in entriesData) {
        const posData = entriesData[word];
        
        for (const pos in posData) {
          const senses = posData[pos].sense || [];
          const synsetIds = senses.map(sense => sense.synset).filter(Boolean);

          if (!wordEntries[word]) {
            wordEntries[word] = [];
          }

          wordEntries[word].push({
            pos,
            synsetIds
          });
        }
      }

      console.log(`Loaded entry data from ${entryFile}`);
    } catch (error) {
      console.error(`Failed to load entry file ${entryFile}:`, error);
    }
  }

  return wordEntries;
}

/**
 * Combines word entries with synset definitions to create the final dictionary.
 * @param {Object} wordEntries - Mapping from word to array of { pos, synsetIds }.
 * @param {Object} synsetMappings - Mapping from synset ID to { pos, definitions }.
 * @returns {Object} - Final dictionary mapping words to their pos and definitions.
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
          if (!finalDictionary[word.toLowerCase()]) {
            finalDictionary[word.toLowerCase()] = [];
          }

          finalDictionary[word.toLowerCase()].push({
            pos: synset.pos,
            definitions: synset.definitions
          });
        } else {
          // Synset not found or no definitions available
          console.warn(`No definitions found for synset ID: ${synsetId} (Word: ${word})`);
        }
      }
    }
  }

  return finalDictionary;
}

/**
 * Loads and parses all WordNet data to create the final dictionary.
 * @returns {Promise<Object>} - Final dictionary ready for use.
 */
export async function loadWordNetDictionary() {
  try {
    console.log("Starting to load synset mappings...");
    const synsetMappings = await loadSynsetMappings();

    console.log("Starting to load word entries...");
    const wordEntries = await loadWordEntries();

    console.log("Combining synset mappings with word entries...");
    const finalDictionary = createFinalDictionary(wordEntries, synsetMappings);

    console.log("WordNet dictionary successfully loaded.");
    return finalDictionary;

  } catch (error) {
    console.error("Error loading WordNet dictionary:", error);
    throw error;
  }
}
