// The codebook. Every piece of feedback is coded against these fixed values,
// which is what makes different retrieval problems countable and comparable.

export const TAXONOMY = {
  photo_type: {
    label: 'What they were looking for',
    multi: false,
    values: {
      moment: { short: 'Moment', long: 'A moment: trip, outing, event, meal, scenery' },
      person_or_pet: { short: 'Person or pet', long: 'Photos of a specific person or pet' },
      document: { short: 'Document', long: 'Document, ID, certificate, notes, whiteboard' },
      receipt_or_bill: { short: 'Receipt or bill', long: 'Receipt, bill, invoice, ticket, warranty' },
      medical: { short: 'Medical', long: 'Medicine, prescription, report, injury or symptom' },
      screenshot: { short: 'Screenshot', long: 'Screenshot or saved image from an app or the web' },
      object_or_product: { short: 'Object', long: 'A specific object or product' },
      video: { short: 'Video', long: 'A video' },
      other: { short: 'Other', long: 'Something else that is named' },
      not_stated: { short: 'Not stated', long: 'The text does not say what kind of photo' }
    }
  },
  remembered: {
    label: 'What they still remember',
    multi: true,
    values: {
      who: { short: 'Who was in it', long: 'The people or pets in or around the photo' },
      where: { short: 'Where', long: 'The place, even loosely ("in Goa", "at the clinic")' },
      when_roughly: { short: 'Roughly when', long: 'A loose period: a year, season, "last summer"' },
      occasion: { short: 'The occasion', long: 'The trip, event or life episode it belongs to' },
      what_was_in_it: { short: 'What was in it', long: 'Objects or scene content' },
      text_in_it: { short: 'Text in it', long: 'Words, numbers or a name visible in the photo' },
      visual_detail: { short: 'A visual detail', long: 'Colour, lighting, angle, composition' },
      why_taken: { short: 'Why it was taken', long: 'The purpose: as a note, proof, to send someone' },
      how_it_arrived: { short: 'How it arrived', long: 'Camera, screenshot, WhatsApp, download, scan' },
      what_was_around_it: { short: 'What came before or after', long: 'Neighbouring events or photos' }
    }
  },
  forgotten: {
    label: 'What they no longer know',
    multi: true,
    values: {
      exact_date: { short: 'The date', long: 'The date or even the year' },
      place: { short: 'The place', long: 'Where it was taken or the place name' },
      album_or_folder: { short: 'Album or folder', long: 'Which album, folder or archive it is in' },
      right_words: { short: 'The right words', long: 'What to type; the name of the thing' },
      device_or_account: { short: 'Device or account', long: 'Which phone, account or app holds it' },
      other: { short: 'Other', long: 'Another stated gap' }
    }
  },
  search_method: {
    label: 'How they searched',
    multi: true,
    values: {
      keyword: { short: 'Keywords', long: 'Typed one or a few words' },
      natural_language: { short: 'Described it', long: 'A sentence or question, including Ask Photos' },
      date: { short: 'By date', long: 'Typed or jumped to a date, month or year' },
      face_group: { short: 'By face', long: 'Used people and pets groups' },
      place_or_map: { short: 'By place', long: 'Used a place name or the map' },
      albums: { short: 'Albums', long: 'Looked through albums or folders' },
      scrolling: { short: 'Scrolling', long: 'Scrolled the timeline' }
    }
  },
  failure_stage: {
    label: 'Where retrieval broke',
    multi: false,
    values: {
      express: { short: 'Could not express it', long: 'The person could not turn what they remember into a search', inScope: true },
      interpret: { short: 'Clues misread', long: 'They searched, and results ignored or misunderstood the clues', inScope: true },
      coverage: { short: 'Content not recognised', long: 'Photos does not index what the photo contains: text, objects, language, screenshots, shared or archived items', inScope: true },
      evaluate: { short: 'Could not spot it', long: 'Too many or poorly ordered results to scan or confirm', inScope: true },
      refine: { short: 'No way to narrow', long: 'After a miss there was no way to adjust, combine clues or continue', inScope: true },
      speed_trust: { short: 'Too slow or unreliable', long: 'Search was slow or inconsistent, so they stopped relying on it', inScope: true },
      not_in_library: { short: 'Photo actually missing', long: 'Backup, sync or deletion problem; not a retrieval failure', inScope: false },
      unclear: { short: 'Unclear', long: 'Retrieval-related, but the text does not show where it broke', inScope: false }
    }
  },
  workaround: {
    label: 'What they did instead',
    multi: true,
    values: {
      scroll_timeline: { short: 'Scrolled the timeline', long: 'Scrolled through months or years of photos' },
      other_app: { short: 'Checked another app', long: 'WhatsApp, Files, Drive, phone gallery, email' },
      ask_someone: { short: 'Asked someone', long: 'Asked a person to find or resend it' },
      manual_organising: { short: 'Organises by hand', long: 'Keeps albums, favourites, captions or labels to find things later' },
      retake_or_redownload: { short: 'Retook or re-downloaded', long: 'Recreated the photo instead of finding it' },
      switched_search_mode: { short: 'Switched search mode', long: 'Turned Ask Photos off or on, or used classic search' },
      third_party_tool: { short: 'Used another tool', long: 'Another gallery, search or AI tool' },
      gave_up: { short: 'Gave up', long: 'Stopped looking' }
    }
  },
  outcome: {
    label: 'How it ended',
    multi: false,
    values: {
      found: { short: 'Found', long: 'Found it without much trouble' },
      found_with_effort: { short: 'Found after effort', long: 'Found it, but only after a workaround or a long hunt' },
      not_found: { short: 'Not found', long: 'Did not find it' },
      unknown: { short: 'Not stated', long: 'The text does not say' }
    }
  },
  stakes: {
    label: 'What was riding on it',
    multi: false,
    values: {
      high: { short: 'High', long: 'Needed for health, money, legal, work or travel, or under time pressure' },
      medium: { short: 'Medium', long: 'Mattered to them; clear frustration or wasted time' },
      low: { short: 'Low', long: 'Casual browsing or mild annoyance' },
      not_stated: { short: 'Not stated', long: 'The text does not say' }
    }
  }
};

export function codebookText() {
  const lines = [];
  for (const [field, def] of Object.entries(TAXONOMY)) {
    lines.push(`${field} (${def.multi ? 'list, zero or more' : 'exactly one'}): ${def.label}`);
    for (const [key, v] of Object.entries(def.values)) lines.push(`  - ${key}: ${v.long}`);
  }
  return lines.join('\n');
}

const DEFAULTS = { photo_type: 'not_stated', failure_stage: 'unclear', outcome: 'unknown', stakes: 'not_stated' };

// Forces a model's answer back onto the codebook. Anything off-codebook is dropped.
export function sanitize(raw) {
  const out = { id: String(raw.id), relevant: raw.relevant === true };
  if (!out.relevant) return out;
  for (const [field, def] of Object.entries(TAXONOMY)) {
    const allowed = def.values;
    if (def.multi) {
      const arr = Array.isArray(raw[field]) ? raw[field] : [];
      out[field] = [...new Set(arr.filter((v) => typeof v === 'string' && allowed[v]))];
    } else {
      out[field] = typeof raw[field] === 'string' && allowed[raw[field]] ? raw[field] : DEFAULTS[field];
    }
  }
  out.quote = typeof raw.quote === 'string' ? raw.quote.trim().slice(0, 400) : '';
  out.note = typeof raw.note === 'string' ? raw.note.trim().slice(0, 240) : '';
  out.query_example = typeof raw.query_example === 'string' ? raw.query_example.trim().slice(0, 160) : '';
  return out;
}

const norm = (s) => s.toLowerCase().replace(/[\u2018\u2019\u201C\u201D'"`]/g, '').replace(/\s+/g, ' ').trim();

// A quote only counts as evidence if it really appears in the source text.
export function verifyQuote(quote, text) {
  if (!quote) return false;
  const q = norm(quote).replace(/^\W+|\W+$/g, '');
  return q.length >= 8 && norm(text).includes(q);
}
