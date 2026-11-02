/**
 * The on-device classifier: which of the taxonomy's categories is this card?
 *
 * It reads three strings that are already on screen, the title, the channel or
 * account name, and whatever else the card shows (badges, hashtags, a
 * description snippet), and answers with a category id, a confidence, and the
 * terms that decided it. Nothing leaves the machine.
 *
 * Why keywords and not a model. This runs inside a content script, on every
 * card in the feed, dozens per scan, and the feed re-scans on every scroll
 * burst. A model in the page's budget is not free: it costs a download, a few
 * hundred megabytes of the tab's memory, and time on the same main thread the
 * site is trying to animate with. A lexicon costs two Map lookups per token.
 * The classifier that runs on all of a person's feed beats the better
 * classifier that made the page stutter, so they turned the extension off.
 *
 * The honest limitation: short slangy titles are where this is weakest. There
 * is no stemming ("built" does not find "build"), no sarcasm, no context, and
 * no language other than English. A three-word TikTok caption often carries no
 * scorable term at all, and the answer is GENERAL with a confidence under
 * LOW_CONFIDENCE. That case, and only that case, is what the optional AI
 * assist exists for: see FeedRules.aiAssist, which is off until asked.
 *
 * Everything here is pure and takes its inputs by argument. No DOM, no fetch,
 * no clock, so a test can pin any verdict it likes.
 */
import { CATEGORY_IDS, GENERAL } from './categories';

/**
 * Below this the on-device answer is a guess rather than a read.
 *
 * Calibrated against the curve in confidenceOf(): one ordinary word lands near
 * 0.31 and one three-letter word near 0.20, both guesses. Three converging
 * terms land near 0.67, which is a read.
 */
export const LOW_CONFIDENCE = 0.45;

/** CLICKBAIT is a category id like any other, but this file decides it twice. */
const CLICKBAIT = 'CLICKBAIT';

/** At or above this, shape beats topic and the card is called clickbait. */
const CLICKBAIT_TAKEOVER = 0.6;

// Term weights. A two-word phrase is worth double a word because it is far
// less ambiguous: "meal prep" is cooking, "prep" on its own is anything.
const WORD_WEIGHT = 1;
const PHRASE_WEIGHT = 2;
/**
 * Three characters or fewer is where false friends live: "ai", "ad", "fed",
 * "vet", "gym". Those terms only ever match a whole token (the index is keyed
 * by token, so a substring match is not expressible) and they carry about half
 * the weight of a real word, so one of them alone can never carry a verdict.
 */
const SHORT_TERM_LEN = 3;
const SHORT_WEIGHT = 0.55;
/**
 * A handful of terms are a declaration of what the item IS rather than a hint
 * about its topic. "Sponsored" is not evidence of advertising, it is the label.
 * These double, which is what lets "Sponsored: try our new protein bar" beat
 * the FITNESS reading of "protein".
 */
const DECISIVE_MULT = 2;

// Field weights. A channel name is a standing declaration ("Fitness Blender"
// will be fitness next week too); a title is one video; meta is whatever the
// card had room for, including boilerplate, so it counts least.
const TITLE_WEIGHT = 1;
const CHANNEL_WEIGHT = 1.6;
const META_WEIGHT = 0.6;

/** Curve constant. Score/(score+K) saturates, so a long title cannot run away. */
const CURVE_K = 2.2;
/**
 * Two different terms agreeing is worth more than one term appearing twice,
 * because agreement is the only evidence here that is not a coincidence.
 */
const DIVERSITY_BONUS = 0.25;

const MAX_TOKENS = 60;
const MAX_MATCHED = 6;
const MAX_ALTERNATES = 3;

// Hoisted because these run on every card: a regex literal inside a function
// is re-evaluated per call, and this file is on the scroll path.
// Written as escapes, not as the characters themselves: a combining mark or a
// curly quote pasted into a character class is invisible in a diff, and an
// editor that "helpfully" normalises one silently changes what this matches.
const COMBINING = /[\u0300-\u036f]/g;
/** Stripped, not split, so "let's play" tokenizes as "lets play" not "let". */
const APOSTROPHE = /['\u2018\u2019\u02bc]/g;
const NOT_ALNUM = /[^a-z0-9]+/g;
const WHITESPACE = /\s+/g;

/**
 * Lowercase, de-accent, and cut into scorable tokens.
 *
 * Anything that is not an ASCII letter or digit is a separator, which is how
 * emoji and CJK are handled: they become gaps and disappear rather than
 * throwing. A CJK-only title therefore tokenizes to nothing and the verdict is
 * GENERAL, which is the truthful answer for a lexicon that only speaks English.
 * Single characters are dropped ("a", "I", the "s" left by a possessive) and
 * the count is capped, because a description snippet can be a novel.
 */
export function tokenize(text: string): string[] {
  if (!text) return [];
  const flat = text
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING, '')
    .replace(APOSTROPHE, '')
    .replace(NOT_ALNUM, ' ');
  const out: string[] = [];
  for (const part of flat.split(' ')) {
    if (part.length < 2) continue;
    out.push(part);
    if (out.length >= MAX_TOKENS) break;
  }
  return out;
}

// ─── The lexicon ─────────────────────────────────────────────────────────────
/**
 * Category id to terms. One or two words each: the index only holds unigrams
 * and bigrams, so a three-word term is silently skipped by the builder.
 *
 * Written from what actually appears in YouTube titles, TikTok and Instagram
 * captions, and X posts, including the channel-name giveaways ("vevo", "espn"),
 * because the channel field is the strongest single signal on a card. Terms
 * deliberately appear under more than one category where they genuinely are
 * ambiguous ("mortgage" is finance and real estate); the scoring is additive,
 * so the rest of the card breaks the tie.
 *
 * Two rules that cost real accuracy when broken:
 *   - no term may contain a one-letter word ("series a" tokenizes to "series",
 *     which then matches every TV show on the platform);
 *   - no stemming, so list the form people type. "Built" is not "build".
 */
const LEXICON: Record<string, readonly string[]> = {
  EDU: [
    'tutorial', 'explained', 'explainer', 'lesson', 'course', 'lecture', 'homework',
    'revision', 'syllabus', 'exam', 'exam prep', 'calculus', 'algebra', 'geometry',
    'vocabulary', 'grammar', 'textbook', 'study', 'studying', 'study tips', 'university',
    'professor', 'classroom', 'degree', 'thesis', 'beginners', 'masterclass',
    'khan academy', 'crash course', 'ted talk', 'note taking', 'flashcards', 'quiz',
    '3blue1brown', 'walkthrough guide', 'step by',
  ],
  SCIENCE: [
    'physics', 'quantum', 'chemistry', 'biology', 'astronomy', 'telescope', 'galaxy',
    'particle', 'experiment', 'laboratory', 'hypothesis', 'evolution', 'genome', 'dna',
    'nasa', 'spacex', 'rocket launch', 'black hole', 'solar system', 'periodic table',
    'microscope', 'neuroscience', 'geology', 'fossil', 'relativity', 'entropy',
    'scientists', 'research paper', 'peer review', 'veritasium', 'kurzgesagt',
    'space station', 'gravity', 'molecule', 'bacteria', 'thermodynamics',
  ],
  DOCUMENTARY: [
    'documentary', 'docuseries', 'full documentary', 'archive footage', 'untold story',
    'true story', 'whistleblower', 'inside story', 'declassified', 'restored footage',
    'chronicles', 'eyewitness', 'testimony', 'oral history', 'cold case', 'unsolved',
    'forensic', 'dossier', 'field report', 'making of', 'retrospective', 'expose',
    'investigative', 'never aired', 'lost tapes', 'the rise', 'downfall', 'firsthand',
  ],
  HISTORY: [
    'history', 'historical', 'ancient', 'medieval', 'empire', 'dynasty', 'pharaoh',
    'roman', 'egypt', 'viking', 'samurai', 'ww2', 'world war', 'cold war', 'civil war',
    'revolution', 'battle of', 'century', 'archaeology', 'artifact', 'colonial',
    'napoleon', 'ottoman', 'renaissance', 'prehistoric', 'castle', 'knights',
    'mythology', 'ruins', 'treaty', 'monarchy', 'crusade', 'shipwreck', '1940s',
  ],
  PODCAST: [
    'podcast', 'podcasts', 'full episode', 'episode', 'interview', 'full interview',
    'long form', 'roundtable', 'sit down', 'unfiltered', 'candid conversation',
    'guest', 'cohost', 'audio only', 'listen now', 'podcast clip', 'mic', 'studio session',
    'talk show', 'unedited', 'rapid fire', 'closing thoughts', 'show notes', 'anchor chat',
    'apple podcasts', 'spotify podcast',
  ],
  CODING: [
    'code', 'coding', 'programming', 'developer', 'javascript', 'typescript', 'python',
    'rust', 'golang', 'kotlin', 'compiler', 'debugging', 'refactor', 'api', 'backend',
    'frontend', 'database', 'sql', 'regex', 'git', 'github', 'docker', 'kubernetes',
    'leetcode', 'algorithm', 'data structures', 'open source', 'framework', 'react',
    'terminal', 'unit tests', 'code review', 'pull request', 'low level', 'syntax',
    'runtime', 'stack trace', 'boilerplate',
  ],
  TECH: [
    'gadget', 'smartphone', 'iphone', 'android', 'laptop', 'unboxing', 'benchmark',
    'teardown', 'usb', 'gpu', 'cpu', 'ram', 'ssd', 'headphones', 'earbuds', 'monitor',
    'keyboard', 'tablet', 'firmware', 'battery life', 'spec sheet', 'hands on',
    'silicon', 'chipset', 'semiconductor', 'wifi', 'router', 'smart home', 'wearable',
    'drone', 'macbook', 'samsung', 'tech news', 'refresh rate', 'thermals', 'ports',
  ],
  AI: [
    'ai', 'llm', 'gpt', 'chatgpt', 'claude', 'gemini', 'prompt', 'prompting', 'neural',
    'neural network', 'machine learning', 'deep learning', 'transformer', 'transformers',
    'fine tuning', 'inference', 'embeddings', 'diffusion', 'midjourney',
    'stable diffusion', 'openai', 'anthropic', 'hugging face', 'training run',
    'dataset', 'alignment', 'hallucination', 'copilot', 'ai art', 'ai generated',
    'context window', 'agentic', 'chatbot', 'model weights',
  ],
  STARTUP: [
    'startup', 'founder', 'cofounder', 'seed round', 'funding round', 'venture capital',
    'pitch deck', 'bootstrapped', 'saas', 'mrr', 'churn', 'runway', 'accelerator',
    'angel investor', 'term sheet', 'cap table', 'unicorn', 'ipo', 'acquisition',
    'solopreneur', 'indie hacker', 'product launch', 'growth loop', 'burn rate',
    'first hire', 'cofounder split', 'market fit', 'traction', 'incubator', 'demo day',
  ],
  FINANCE: [
    'stocks', 'stock market', 'investing', 'portfolio', 'dividend', 'etf', 'index fund',
    'earnings', 'recession', 'inflation', 'interest rates', 'rate cut', 'rate hike',
    'fed', 'federal reserve', 'bond yields', 'mortgage', 'mortgage rates', 'savings',
    'budgeting', 'debt', 'credit score', 'retirement', '401k', 'roth ira', 'tax',
    'taxes', 'valuation', 'balance sheet', 'hedge fund', 'wall street', 'bloomberg',
    'cnbc', 'day trading', 'bull market', 'bear market', 'net worth', 'passive income',
    'compound interest', 'economy', 'gdp',
  ],
  CRYPTO: [
    'bitcoin', 'btc', 'ethereum', 'eth', 'crypto', 'altcoin', 'blockchain', 'defi',
    'nft', 'ledger', 'mining rig', 'halving', 'satoshi', 'stablecoin', 'solana',
    'dogecoin', 'memecoin', 'airdrop', 'staking', 'cold storage', 'seed phrase', 'web3',
    'binance', 'coinbase', 'on chain', 'bull run', 'rug pull', 'smart contract',
    'token launch', 'hodl', 'gas fees', 'crypto wallet',
  ],
  REALESTATE: [
    'real estate', 'realtor', 'mortgage', 'landlord', 'tenant', 'rental property',
    'house tour', 'home tour', 'listing', 'closing costs', 'escrow', 'foreclosure',
    'appraisal', 'zoning', 'hoa', 'apartment', 'condo', 'duplex', 'square feet',
    'open house', 'first home', 'house flip', 'flipping houses', 'housing market',
    'down payment', 'curb appeal', 'floor plan', 'lease', 'property taxes', 'realty',
    'tiny home', 'new build',
  ],
  DIY: [
    'diy', 'woodworking', 'workshop', 'plywood', 'sawdust', 'drill', 'welding', 'epoxy',
    'sanding', 'joinery', 'upcycle', 'restoration', 'repair', 'handmade', 'homemade',
    '3d print', '3d printing', 'cnc', 'lathe', 'table saw', 'tool review', 'shed build',
    'deck build', 'paint job', 'wiring', 'plumbing', 'tiling', 'garage build',
    'renovation', 'power tools', 'workbench', 'fixed it',
  ],
  ART: [
    'art', 'artist', 'drawing', 'sketch', 'sketchbook', 'painting', 'watercolour',
    'watercolor', 'acrylic', 'oil paint', 'illustration', 'digital art', 'procreate',
    'graphic design', 'typography', 'logo design', 'sculpture', 'ceramics', 'pottery',
    'calligraphy', 'character design', 'concept art', 'color theory', 'gallery',
    'exhibition', 'museum', 'figure drawing', 'animation', 'storyboard', 'photoshop',
    'linework', 'shading',
  ],
  HEALTH: [
    'health', 'doctor', 'symptoms', 'diagnosis', 'medication', 'antibiotics',
    'blood pressure', 'cholesterol', 'diabetes', 'immune system', 'gut health',
    'sleep quality', 'insomnia', 'anxiety', 'depression', 'therapy', 'mental health',
    'migraine', 'allergy', 'vitamin', 'supplements', 'hydration', 'dentist', 'posture',
    'back pain', 'physiotherapy', 'clinic', 'surgery', 'cancer', 'checkup', 'longevity',
    'nutrition', 'hormones', 'burnout',
  ],
  FITNESS: [
    'workout', 'gym', 'hiit', 'cardio', 'squat', 'deadlift', 'bench press', 'reps',
    'abs', 'six pack', 'core workout', 'full body', 'no equipment', 'dumbbell',
    'kettlebell', 'treadmill', 'running', 'marathon', '5k', 'stretching', 'mobility',
    'yoga', 'pilates', 'calisthenics', 'bodybuilding', 'protein', 'macros', 'bulking',
    'personal trainer', 'home workout', 'warm up', 'cool down', 'pull ups', 'push ups',
    'fitness', 'rest day',
  ],
  COOKING: [
    'recipe', 'recipes', 'cooking', 'baking', 'kitchen', 'oven', 'skillet', 'sourdough',
    'dough', 'pasta', 'risotto', 'roast', 'marinade', 'sauce', 'seasoning', 'air fryer',
    'slow cooker', 'meal prep', 'one pot', 'weeknight dinner', 'breakfast', 'brunch',
    'dessert', 'cookies', 'bread', 'chef', 'taste test', 'street food', 'vegan recipe',
    'easy dinner', 'ingredients', 'knife skills', 'sous vide', 'grill', 'ramen', 'spice',
  ],
  TRAVEL: [
    'travel', 'itinerary', 'backpacking', 'hostel', 'flight', 'airport', 'layover',
    'boarding pass', 'passport', 'visa', 'road trip', 'van life', 'city guide',
    'hidden gems', 'tourist', 'sightseeing', 'beach resort', 'hotel review', 'airbnb',
    'cruise', 'train journey', 'solo travel', 'budget travel', 'digital nomad', 'expat',
    'packing list', 'carry on', 'jet lag', 'europe trip', 'border crossing', 'souvenir',
    'day trip',
  ],
  NATURE: [
    'nature', 'wilderness', 'forest', 'mountain', 'hiking trail', 'waterfall', 'glacier',
    'volcano', 'canyon', 'coral reef', 'ocean', 'tide', 'storm chasing', 'hurricane',
    'tornado', 'aurora', 'ecosystem', 'rainforest', 'desert', 'wetlands',
    'conservation', 'national park', 'camping', 'foraging', 'bushcraft', 'wildfire',
    'climate', 'biodiversity', 'sunset timelapse', 'trailhead', 'summit push',
  ],
  ANIMALS: [
    'dog', 'puppy', 'cat', 'kitten', 'pets', 'rescue dog', 'vet', 'aquarium',
    'fish tank', 'parrot', 'hamster', 'rabbit', 'horse', 'wildlife', 'lion', 'elephant',
    'shark', 'snake', 'spider', 'bird watching', 'zoo', 'animal shelter', 'breed',
    'grooming', 'puppy training', 'litter box', 'paws', 'purring', 'barking',
    'cute animals', 'farm animals', 'husky', 'golden retriever', 'adopted',
  ],
  FASHION: [
    'fashion', 'outfit', 'ootd', 'wardrobe', 'styling', 'lookbook', 'haul', 'thrift',
    'thrifting', 'streetwear', 'sneakers', 'runway', 'couture', 'capsule wardrobe',
    'denim', 'tailoring', 'makeup', 'skincare', 'beauty routine', 'hair tutorial',
    'nails', 'fragrance', 'perfume', 'jewellery', 'jewelry', 'handbag', 'vintage finds',
    'get ready', 'grwm', 'style tips', 'closet tour', 'fit check', 'designer bag',
  ],
  CARS: [
    'car', 'cars', 'engine', 'horsepower', 'torque', 'turbo', 'exhaust', 'drift',
    'track day', 'dyno', 'gearbox', 'manual transmission', 'suspension', 'tyres',
    'tires', 'brakes', 'ev', 'tesla', 'porsche', 'bmw', 'toyota', 'test drive',
    'road test', 'mechanic', 'oil change', 'detailing', 'supercar', 'hypercar',
    'muscle car', 'jdm', 'rally', 'motorcycle', 'mpg', 'dashcam', 'engine swap',
  ],
  LIFE: [
    'vlog', 'daily vlog', 'morning routine', 'night routine', 'apartment tour',
    'routine', 'habits', 'journaling', 'minimalism', 'decluttering', 'productivity',
    'planner', 'self care', 'moving out', 'adulting', 'life update', 'weekly reset',
    'slow living', 'cozy', 'coffee shop', 'cleaning routine', 'college life',
    'work from', 'sunday reset', 'aesthetic', 'my day', 'parenting', 'new chapter',
    'organising', 'organizing',
  ],
  MOTIVATION: [
    'motivation', 'motivational', 'discipline', 'mindset', 'grind', 'hustle',
    'no excuses', 'wake up', 'self improvement', 'success habits', 'goal setting',
    'willpower', 'comfort zone', 'stoic', 'stoicism', 'inspiration', 'keep going',
    'never give', 'transformation', 'level up', 'accountability', 'work ethic',
    'consistency', 'perseverance', 'motivational speech', 'dream big', 'stay focused',
    'winners mindset', 'rock bottom',
  ],
  RELATIONSHIP: [
    'relationship', 'dating', 'girlfriend', 'boyfriend', 'breakup', 'marriage',
    'wedding', 'husband', 'wife', 'divorce', 'couple', 'situationship', 'red flags',
    'green flags', 'first date', 'love language', 'attachment style', 'texting',
    'flirting', 'crush', 'proposal', 'anniversary', 'long distance', 'couples therapy',
    'intimacy', 'trust issues', 'ghosting', 'soulmate', 'moving in', 'dating advice',
  ],
  MUSIC: [
    'music', 'song', 'songs', 'album', 'remix', 'cover', 'acoustic',
    'live performance', 'concert', 'tour dates', 'lyrics', 'lyric video',
    'official video', 'official audio', 'vevo', 'producer', 'instrumental', 'guitar',
    'piano', 'drums', 'vocals', 'chords', 'playlist', 'mixtape', 'band', 'rapper',
    'dj set', 'festival set', 'karaoke', 'sheet music', 'music video', 'unreleased',
    'billboard',
  ],
  COMEDY: [
    'comedy', 'funny', 'standup', 'stand up', 'sketch comedy', 'parody', 'prank',
    'impressions', 'roast', 'joke', 'jokes', 'hilarious', 'bloopers', 'blooper reel',
    'satire', 'meme', 'memes', 'comedian', 'punchline', 'improv', 'gag', 'spoof',
    'skit', 'banter', 'one liner', 'crowd work', 'comedy special', 'funny moments',
    'laughing', 'cursed',
  ],
  SPORT: [
    'football', 'soccer', 'basketball', 'nba', 'nfl', 'baseball', 'mlb', 'cricket',
    'tennis', 'golf', 'hockey', 'nhl', 'ufc', 'boxing', 'mma', 'olympics', 'world cup',
    'premier league', 'la liga', 'playoffs', 'touchdown', 'penalty', 'offside',
    'highlights', 'match highlights', 'full match', 'halftime', 'transfer news', 'espn',
    'sky sports', 'referee', 'rugby', 'f1', 'formula one', 'grand prix', 'season opener',
  ],
  GAMING: [
    'gameplay', 'gamer', 'gaming', 'playthrough', 'walkthrough', 'speedrun',
    'boss fight', 'respawn', 'loadout', 'fortnite', 'minecraft', 'roblox', 'valorant',
    'warzone', 'elden ring', 'zelda', 'pokemon', 'gta', 'rpg', 'fps', 'esports',
    'twitch', 'streamer', 'patch notes', 'tier list', 'ranked', 'achievement', 'dlc',
    'mod showcase', 'playstation', 'xbox', 'nintendo', 'steam deck', 'multiplayer',
    'lets play',
  ],
  ENTERTAINMENT: [
    'movie', 'film', 'trailer', 'teaser', 'netflix', 'hbo', 'disney', 'marvel',
    'box office', 'season finale', 'episode recap', 'tv show', 'series review', 'anime',
    'manga', 'kdrama', 'reality show', 'awards show', 'oscars', 'cast interview',
    'streaming', 'binge', 'spoilers', 'ending explained', 'fan theory', 'sequel',
    'remake', 'casting', 'blockbuster', 'sitcom', 'cartoon', 'asmr', 'reaction video',
    'compilation',
  ],
  SHOPPING: [
    'haul', 'unboxing', 'deal', 'deals', 'discount', 'coupon', 'promo code',
    'black friday', 'prime day', 'sale', 'amazon finds', 'product review', 'worth it',
    'budget picks', 'dupe', 'dupes', 'shopping', 'checkout', 'restock', 'wishlist',
    'gift guide', 'price drop', 'clearance', 'buy now', 'link in', 'affiliate',
    'review', 'must have', 'top picks', 'subscription box', 'aliexpress', 'temu',
    'shein', 'add to',
  ],
  NEWS: [
    'news', 'breaking', 'breaking news', 'headlines', 'live coverage',
    'press conference', 'reuters', 'associated press', 'bbc news', 'cnn',
    'correspondent', 'developing story', 'latest update', 'death toll', 'evacuation',
    'verdict', 'arrested', 'indictment', 'protest', 'ceasefire', 'summit',
    'earthquake', 'storm warning', 'recall', 'outage', 'weather alert', 'local news',
    'bulletin', 'statement', 'officials say', 'death of',
  ],
  POLITICS: [
    'election', 'campaign', 'senator', 'congress', 'parliament', 'president',
    'prime minister', 'vote', 'ballot', 'polls', 'republican', 'democrat',
    'conservative', 'legislation', 'bill passed', 'supreme court', 'immigration',
    'tariff', 'sanctions', 'debate', 'governor', 'cabinet', 'filibuster',
    'impeachment', 'referendum', 'party leader', 'white house', 'foreign policy',
    'geopolitics', 'propaganda', 'lawmakers', 'policy',
  ],
  GOSSIP: [
    'celebrity', 'celeb', 'gossip', 'spotted', 'spotted together', 'dating rumours',
    'rumours', 'rumors', 'feud', 'drama', 'clapback', 'tmz', 'kardashian', 'engaged',
    'paparazzi', 'red carpet', 'unfollowed', 'cryptic post', 'sources say',
    'insider claims', 'allegedly', 'tell all', 'hollywood', 'love triangle',
    'fans react', 'slammed', 'breaks silence', 'seen leaving', 'new romance',
    'split from',
  ],
  CLICKBAIT: [
    'gone wrong', 'you wont', 'wont believe', 'shocking', 'insane', 'unbelievable',
    'mind blowing', 'jaw dropping', 'will shock', 'nobody talks', 'truth about',
    'doctors hate', 'secret revealed', 'exposed', 'caught on', 'changes everything',
    'life changing', 'banned', 'forbidden', 'top 10', 'craziest', 'weirdest', 'wildest',
    'epic fail', 'must see', 'watch till', 'hidden truth', 'they lied', 'clickbait',
    'went wrong',
  ],
  GAMBLING: [
    'casino', 'betting', 'bet', 'bets', 'odds', 'parlay', 'sportsbook', 'roulette',
    'blackjack', 'poker', 'slots', 'jackpot', 'wager', 'bookmaker', 'betting tips',
    'free spins', 'bonus code', 'high roller', 'gambling', 'payout', 'bankroll',
    'accumulator', 'lottery', 'scratch card', 'big win', 'huge win', 'all in',
    'texas holdem', 'bluff', 'house edge',
  ],
  AD: [
    'sponsored', 'sponsor', 'paid partnership', 'ad', 'advert', 'advertisement',
    'promotion', 'promoted', 'brand deal', 'discount code', 'promo code',
    'affiliate link', 'for sponsoring', 'link below', 'swipe up', 'shop now',
    'limited offer', 'free trial', 'giveaway', 'promo', 'terms apply', 'commercial',
    'presented by', 'partnered with', 'use code', 'my code', 'available now',
    'out now', 'in collab',
  ],
};

/**
 * Terms that name what the item is rather than what it is about.
 *
 * Every entry must also appear in LEXICON above: this set only changes a
 * weight, it does not add a term. Kept short on purpose. Once everything is
 * decisive nothing is, and the confidence curve stops meaning anything.
 */
const DECISIVE: ReadonlySet<string> = new Set([
  'sponsored', 'paid partnership', 'brand deal', 'promo code',
  'vevo', 'official video', 'official audio', 'lyric video',
  'espn', 'match highlights', 'full match',
  'gameplay', 'speedrun', 'playthrough',
  'full documentary', 'podcast', 'recipe', 'workout',
  'casino', 'sportsbook',
]);

/**
 * The one place a term may match inside a word, and only in the channel field.
 *
 * Channel names are written as compounds with the spaces removed:
 * "FitnessBlender", "TechLinked", "CryptoBanter". Tokenizing those gives one
 * useless token, so the channel gets a second pass that looks for these stems
 * as substrings. It stays a short hand-picked list because it is O(stems) per
 * card rather than O(tokens), and because substring matching is exactly the
 * thing that produces nonsense: "pets" was dropped from this list when it
 * turned out to be inside "carpets", and "style" because it is inside
 * "lifestyle". Nothing here is shorter than four characters.
 */
const CHANNEL_STEMS: ReadonlyArray<readonly [string, string]> = [
  ['fitness', 'FITNESS'], ['workout', 'FITNESS'],
  ['cooking', 'COOKING'], ['kitchen', 'COOKING'], ['recipes', 'COOKING'],
  ['gaming', 'GAMING'], ['gamer', 'GAMING'], ['esports', 'GAMING'],
  ['coding', 'CODING'], ['developer', 'CODING'], ['programming', 'CODING'],
  ['crypto', 'CRYPTO'], ['bitcoin', 'CRYPTO'],
  ['finance', 'FINANCE'], ['invest', 'FINANCE'], ['money', 'FINANCE'],
  ['travel', 'TRAVEL'], ['wander', 'TRAVEL'],
  ['music', 'MUSIC'], ['vevo', 'MUSIC'], ['records', 'MUSIC'],
  ['espn', 'SPORT'], ['sports', 'SPORT'], ['football', 'SPORT'],
  ['news', 'NEWS'],
  ['politic', 'POLITICS'],
  ['gossip', 'GOSSIP'],
  ['fashion', 'FASHION'], ['beauty', 'FASHION'],
  ['motors', 'CARS'], ['garage', 'CARS'],
  ['science', 'SCIENCE'], ['physics', 'SCIENCE'],
  ['history', 'HISTORY'],
  ['podcast', 'PODCAST'],
  ['academy', 'EDU'], ['school', 'EDU'], ['learn', 'EDU'], ['tutorial', 'EDU'],
  ['wildlife', 'ANIMALS'],
  ['casino', 'GAMBLING'], ['betting', 'GAMBLING'],
  ['realty', 'REALESTATE'], ['realestate', 'REALESTATE'],
  ['comedy', 'COMEDY'],
  ['health', 'HEALTH'],
  ['nature', 'NATURE'],
  ['design', 'ART'],
];

/** A stem shorter than this is a substring accident waiting to happen. */
const MIN_STEM_LEN = 4;
/** Slightly under a whole-token hit: a compound is weaker evidence than a word. */
const STEM_WEIGHT = 0.9;

interface TermHit {
  readonly category: string;
  /** The lexicon term as tokenized, which is what `matched` reports. */
  readonly term: string;
  readonly weight: number;
}

// Built once at module load. Two Maps rather than a scan over the lexicon,
// because the scan would be a thousand comparisons per card.
const WORD_INDEX = new Map<string, TermHit[]>();
const PHRASE_INDEX = new Map<string, TermHit[]>();

function push(index: Map<string, TermHit[]>, key: string, hit: TermHit): void {
  const list = index.get(key);
  if (list) list.push(hit);
  else index.set(key, [hit]);
}

function indexTerm(category: string, term: string): void {
  const parts = tokenize(term);
  // Three or more tokens has no index to live in, and one-letter words have
  // already been dropped by tokenize, which is how "series a" becomes junk.
  if (parts.length === 0 || parts.length > 2) return;
  const decisive = DECISIVE.has(term) ? DECISIVE_MULT : 1;
  if (parts.length === 1) {
    const word = parts[0];
    const base = word.length <= SHORT_TERM_LEN ? SHORT_WEIGHT : WORD_WEIGHT;
    push(WORD_INDEX, word, { category, term: word, weight: base * decisive });
    return;
  }
  const key = `${parts[0]} ${parts[1]}`;
  push(PHRASE_INDEX, key, { category, term: key, weight: PHRASE_WEIGHT * decisive });
}

const KNOWN_CATEGORIES = new Set(CATEGORY_IDS);
const STEMS: ReadonlyArray<readonly [string, string]> = CHANNEL_STEMS.filter(
  ([stem, category]) => stem.length >= MIN_STEM_LEN && KNOWN_CATEGORIES.has(category),
);

for (const [category, terms] of Object.entries(LEXICON)) {
  // categories.ts is the authority on the taxonomy. A lexicon key that is not
  // in it is a rename that was only done half way, and scoring a category the
  // picker cannot show would hide things the user has no way to unhide.
  if (!KNOWN_CATEGORIES.has(category)) continue;
  for (const term of terms) indexTerm(category, term);
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

/** Which field a hit came from. Also the dedupe namespace, see credit(). */
type Field = 'ti' | 'ch' | 'me';

interface Tally {
  scores: Map<string, number>;
  /** First few terms per category, in the order they were met. */
  terms: Map<string, string[]>;
  /** Distinct terms per category, uncapped, for the diversity bonus. */
  counts: Map<string, number>;
  seen: Set<string>;
}

function credit(tally: Tally, field: Field, hit: TermHit, fieldWeight: number): void {
  // One term counts once per field. Repeating a keyword is a spam technique
  // and it used to be a cheap way to force a card into a category.
  const key = `${field}\u0000${hit.category}\u0000${hit.term}`;
  if (tally.seen.has(key)) return;
  tally.seen.add(key);
  tally.scores.set(hit.category, (tally.scores.get(hit.category) || 0) + hit.weight * fieldWeight);
  tally.counts.set(hit.category, (tally.counts.get(hit.category) || 0) + 1);
  const list = tally.terms.get(hit.category);
  if (!list) tally.terms.set(hit.category, [hit.term]);
  else if (list.length < MAX_MATCHED) list.push(hit.term);
}

function scanField(text: string, field: Field, fieldWeight: number, tally: Tally): void {
  const tokens = tokenize(text);
  for (let i = 0; i < tokens.length; i += 1) {
    const words = WORD_INDEX.get(tokens[i]);
    if (words) for (const hit of words) credit(tally, field, hit, fieldWeight);
    if (i + 1 < tokens.length) {
      const phrases = PHRASE_INDEX.get(`${tokens[i]} ${tokens[i + 1]}`);
      if (phrases) for (const hit of phrases) credit(tally, field, hit, fieldWeight);
    }
  }
}

function scanChannelStems(channel: string, tally: Tally): void {
  // Separators removed entirely, so "Fitness Blender" and "FitnessBlender" are
  // the same string here. Credited under 'ch' like the token pass, so a channel
  // that hits both ways is counted once rather than twice.
  const flat = channel.toLowerCase().normalize('NFD').replace(COMBINING, '').replace(NOT_ALNUM, '');
  if (!flat) return;
  for (const [stem, category] of STEMS) {
    if (flat.includes(stem)) {
      credit(tally, 'ch', { category, term: stem, weight: STEM_WEIGHT }, CHANNEL_WEIGHT);
    }
  }
}

/**
 * Raw score to 0..1.
 *
 * Saturating, so a long description cannot inflate a weak read, and boosted by
 * how many different terms agreed rather than by how much they weighed.
 */
function confidenceOf(raw: number, distinct: number): number {
  const effective = raw * (1 + DIVERSITY_BONUS * Math.max(0, distinct - 1));
  return round3(effective / (effective + CURVE_K));
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// ─── Clickbait ───────────────────────────────────────────────────────────────

/**
 * Phrases that are shape, not subject. Matched against a normalized title with
 * apostrophes removed, so "you won't believe" is written here without one.
 */
const BAIT_PHRASES: readonly string[] = [
  'you wont believe', 'gone wrong', 'went horribly wrong',
  'shocking', 'insane', 'nobody is talking about', 'nobody talks about',
  'this changes everything', 'the truth about', 'doctors hate', 'what happened next',
  'will shock you', 'blew my mind', 'i cant believe', 'they dont want you to know',
  'never seen before', 'you need to see', 'watch till the end', 'wait for it',
  'life changing',
];
// Two phrases that were here and are not any more, both because they fired on
// ordinary titles: "wont believe what" only ever co-occurred with "you wont
// believe" and burned the second slot of BAIT_PHRASE_CAP on the same evidence,
// and "this is why" is how half of the explainers on the platform open.

/**
 * Caps runs that are ordinary words in this domain, not shouting.
 *
 * Without this list "NASA confirms", "HIIT workout" and "GTA 6" all scored a
 * clickbait signal for spelling their own name correctly.
 */
const CAPS_SAFE: ReadonlySet<string> = new Set([
  'HIIT', 'NASA', 'ESPN', 'NVIDIA', 'LEGO', 'IKEA', 'ASMR', 'OLED', 'IPHONE', 'MACBOOK',
  'GRWM', 'OOTD', 'CHATGPT', 'AMOLED', 'ESRB', 'FIFA', 'UEFA', 'NCAA', 'IPTV', 'HDMI',
  'USB', 'GPU', 'CPU', 'NBA', 'NFL', 'MLB', 'NHL', 'UFC', 'GTA', 'DLC', 'RPG', 'FPS',
  'AMA', 'CEO', 'IPO', 'ETF', 'IRA', 'DIY', 'SUV', 'EV', 'AI', 'PC', 'VR', 'UK', 'US',
]);

const CAPS_RUN = /[A-Z]{4,}/g;
const SHOUT_MARKS = /[!?]/g;
// The variation selector (FE0F) and the zero width joiner (200D) are in the class
// because a real emoji cluster ends with one of them as often as not: a title
// ending in a flag or a skin-toned hand would otherwise miss.
const EMOJI_LEAD = /^[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\uFE0F\u200D]/u;
const EMOJI_TAIL = /[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\uFE0F]$/u;
const QUESTION_HOOK = /(\?!+|!+\?)$/;
const NUMBER_OPENER = /^(top )?\d{1,3} /;
const SUPERLATIVE =
  /\b(craziest|best|worst|weirdest|wildest|most|insane|shocking|rarest|dumbest|scariest|deadliest|banned|illegal|expensive|impossible|hardest|biggest|greatest|unbelievable)\b/;

const EYES_EMOJI = '\u{1F440}';
const POINTER_EMOJI = ['\u{1F449}', '\u{1F448}', '\u{1F447}', '\u{1F446}', '\u27A1', '\u2B05', '\u2935'];

// What each signal is worth. Phrases dominate because they are the technique
// itself; punctuation and caps are only corroboration, since a legitimate
// title is allowed to be excited once.
const BAIT_PHRASE_WEIGHT = 0.45;
const BAIT_PHRASE_CAP = 2;
const BAIT_WEIGHTS = {
  caps: 0.25,
  marks: 0.25,
  emojiEdge: 0.15,
  eyes: 0.12,
  pointer: 0.12,
  notClickbait: 0.5,
  numberSuperlative: 0.35,
  questionHook: 0.2,
};

/**
 * Clickbait is a shape, not a topic, so it is scored separately from the
 * lexicon and can outvote it. The signals are returned by name because the
 * panel has to answer "why was this hidden" with something better than a
 * number, and because a test that asserts a score without asserting which
 * signal produced it passes for the wrong reason.
 */
export function clickbaitScore(title: string): { score: number; signals: string[] } {
  const signals: string[] = [];
  const raw = (title || '').trim();
  if (!raw) return { score: 0, signals };

  const flat = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING, '')
    .replace(APOSTROPHE, '')
    .replace(NOT_ALNUM, ' ')
    .trim();
  const padded = ` ${flat} `;

  let score = 0;

  let phraseHits = 0;
  for (const phrase of BAIT_PHRASES) {
    if (phraseHits >= BAIT_PHRASE_CAP) break;
    if (padded.includes(` ${phrase} `)) {
      signals.push(phrase);
      score += BAIT_PHRASE_WEIGHT;
      phraseHits += 1;
    }
  }

  const caps = raw.match(CAPS_RUN);
  if (caps && caps.some((run) => !CAPS_SAFE.has(run))) {
    signals.push('all-caps');
    score += BAIT_WEIGHTS.caps;
  }

  const marks = raw.match(SHOUT_MARKS);
  if (marks && marks.length >= 3) {
    signals.push('punctuation-run');
    score += BAIT_WEIGHTS.marks;
  }

  if (EMOJI_LEAD.test(raw) || EMOJI_TAIL.test(raw)) {
    signals.push('emoji-bookend');
    score += BAIT_WEIGHTS.emojiEdge;
  }

  if (raw.includes(EYES_EMOJI)) {
    signals.push('eyes-emoji');
    score += BAIT_WEIGHTS.eyes;
  }

  if (POINTER_EMOJI.some((arrow) => raw.includes(arrow))) {
    signals.push('arrow-emoji');
    score += BAIT_WEIGHTS.pointer;
  }

  // Saying "not clickbait" is the single most reliable admission there is.
  if (padded.includes(' not clickbait ')) {
    signals.push('not-clickbait');
    score += BAIT_WEIGHTS.notClickbait;
  }

  if (NUMBER_OPENER.test(flat) && SUPERLATIVE.test(flat)) {
    signals.push('number-superlative');
    score += BAIT_WEIGHTS.numberSuperlative;
  }

  if (QUESTION_HOOK.test(raw)) {
    signals.push('question-hook');
    score += BAIT_WEIGHTS.questionHook;
  }

  return { score: round3(Math.min(1, score)), signals };
}

// ─── Fingerprint ─────────────────────────────────────────────────────────────

function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * Stable key for a title and channel pair, so a correction survives a reload.
 *
 * The title is cut to 80 characters because platforms truncate long titles
 * differently depending on column width, and a key that changes when the window
 * is resized would silently drop the correction the user made. Hashed rather
 * than stored whole so the corrections map cannot grow into a readable history
 * of everything the person watched.
 */
export function fingerprint(input: ClassifyInput): string {
  const title = (input.title || '').toLowerCase().replace(WHITESPACE, ' ').trim().slice(0, 80);
  const channel = (input.channel || '').toLowerCase().replace(WHITESPACE, ' ').trim();
  // A unit separator, written as an escape so it is visible in review: the
  // literal control character survives a copy and paste as an invisible byte.
  return fnv1a(`${title}\u001f${channel}`);
}

// ─── The verdict ─────────────────────────────────────────────────────────────

export interface ClassifyInput {
  title: string;
  /** Channel, account, or author name. */
  channel?: string;
  /** Anything else visible on the card: badges, hashtags, a description snippet. */
  meta?: string;
}

export interface Verdict {
  /** A category id from CATEGORY_IDS, or GENERAL when nothing scored. */
  category: string;
  /** 0 to 1. Below LOW_CONFIDENCE the caller may ask the AI provider. */
  confidence: number;
  /** The terms that decided it, for the correction popover and for tests. */
  matched: string[];
  /** Runner-up categories, best first, for the "closest matches" picker. */
  alternates: string[];
}

export function classify(input: ClassifyInput, corrections?: Record<string, string>): Verdict {
  // Checked before anything is scored. A correction is the user telling us we
  // were wrong, and re-deriving an answer they already overruled is the one
  // behaviour guaranteed to make the feature feel broken.
  if (corrections) {
    const fixed = corrections[fingerprint(input)];
    if (fixed) return { category: fixed, confidence: 1, matched: ['corrected'], alternates: [] };
  }

  const title = input.title || '';
  const tally: Tally = {
    scores: new Map(),
    terms: new Map(),
    counts: new Map(),
    seen: new Set(),
  };

  scanField(title, 'ti', TITLE_WEIGHT, tally);
  if (input.channel) {
    scanField(input.channel, 'ch', CHANNEL_WEIGHT, tally);
    scanChannelStems(input.channel, tally);
  }
  if (input.meta) scanField(input.meta, 'me', META_WEIGHT, tally);

  // Ties break alphabetically rather than by insertion order, so reordering the
  // lexicon can never silently flip a pinned test.
  const ranked = [...tally.scores.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const topical = ranked.length ? ranked[0][0] : GENERAL;
  const alternates = ranked.slice(1, 1 + MAX_ALTERNATES).map((entry) => entry[0]);

  const bait = clickbaitScore(title);
  if (bait.score >= CLICKBAIT_TAKEOVER) {
    // The topic survives as the first alternate: "clickbait about coding" is
    // still coding to somebody who allowed coding, and the alternates row is
    // where they say so in one press.
    const kept = topical !== GENERAL && topical !== CLICKBAIT ? [topical, ...alternates] : alternates;
    return {
      category: CLICKBAIT,
      confidence: round3(Math.min(0.95, bait.score)),
      matched: bait.signals.slice(0, MAX_MATCHED),
      // A confidence of exactly 1 is reserved for a human correction, so shape
      // alone never claims certainty.
      alternates: kept.slice(0, MAX_ALTERNATES),
    };
  }

  // GENERAL, never OTHER. OTHER means "the provider placed this outside the
  // taxonomy", which is a thing only the AI path can conclude; a lexicon that
  // found nothing has not identified anything, it has merely run out of words.
  if (!ranked.length) return { category: GENERAL, confidence: 0, matched: [], alternates: [] };

  const [category, raw] = ranked[0];
  return {
    category,
    confidence: confidenceOf(raw, tally.counts.get(category) || 1),
    matched: tally.terms.get(category) || [],
    alternates,
  };
}
