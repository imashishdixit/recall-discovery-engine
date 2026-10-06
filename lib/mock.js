// Used only when MOCK_LLM=1, so the pipeline can be tested without an API key.
// It applies crude keyword rules. Its output is NOT research evidence.

export function mockCode(items) {
  return {
    items: items.map((it) => {
      const t = it.text.toLowerCase();
      const relevant = /(search|find|found|looking for|scroll|ask photos)/.test(t);
      if (!relevant) return { id: it.id, relevant: false };
      const has = (re) => re.test(t);
      return {
        id: it.id,
        relevant: true,
        photo_type: has(/receipt|bill/) ? 'receipt_or_bill' : has(/medicine|prescription/) ? 'medical' : has(/screenshot/) ? 'screenshot' : has(/trip|cafe|beach/) ? 'moment' : 'not_stated',
        remembered: [has(/trip|goa/) && 'occasion', has(/last year|summer|20\d\d/) && 'when_roughly', has(/with my|friend|mom|dad/) && 'who'].filter(Boolean),
        forgotten: [has(/don'?t remember when|what date|which year/) && 'exact_date', has(/what to type|right word/) && 'right_words'].filter(Boolean),
        search_method: [has(/typed|keyword|searched for/) && 'keyword', has(/ask photos/) && 'natural_language', has(/scroll/) && 'scrolling'].filter(Boolean),
        failure_stage: has(/no results|nothing/) ? 'coverage' : has(/wrong|irrelevant|random/) ? 'interpret' : has(/slow/) ? 'speed_trust' : has(/what to type/) ? 'express' : 'unclear',
        workaround: [has(/scroll/) && 'scroll_timeline', has(/whatsapp/) && 'other_app', has(/gave up/) && 'gave_up'].filter(Boolean),
        outcome: has(/gave up|never found/) ? 'not_found' : has(/finally found/) ? 'found_with_effort' : 'unknown',
        stakes: has(/urgent|doctor|needed|claim/) ? 'high' : 'medium',
        query_example: '',
        quote: it.text.split(/(?<=[.!?])\s/)[0].split(' ').slice(0, 28).join(' '),
        note: 'Mock rule-based code for testing.',
        bogus_field: 'should be dropped'
      };
    })
  };
}

export function mockSynth(items) {
  return {
    opportunities: [{
      name: 'Mock opportunity', scenario: 'Mock scenario', breaks_at: 'interpret', root_cause: 'Mock', workaround: 'Mock',
      evidence_ids: [...items.slice(0, 3).map((i) => i.id), 'made_up_id'], evidence_strength: 'thin', would_change_my_mind: 'Mock'
    }],
    not_supported: ['Mock'], caveats: ['Mock mode: not real analysis']
  };
}

export function mockAsk(items) {
  return { answer: `Mock answer citing [${items[0]?.id || 'none'}].`, evidence_ids: [items[0]?.id, 'made_up_id'].filter(Boolean), rows_that_bear_on_this: 1 };
}
