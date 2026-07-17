#!/usr/bin/env node
/*
 * TVP/2007 content curator.
 *
 * Harvests free/open video from Internet Archive collections, verifies that
 * each item has a light H.264 derivative (fast to start on mobile), extracts
 * durations, and regenerates ../app/js/channels.js.
 *
 * Run:  node curate.mjs            (writes channels.js)
 *       node curate.mjs --dry     (report only)
 *
 * Being polite to archive.org: modest concurrency, one metadata call per
 * candidate, a single 1-byte ranged GET to verify the chosen file streams.
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync, appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "app", "js", "channels.js");

/* resumability: metadata responses and verified URLs are cached on disk,
   so an interrupted run (or an archive.org rate-limit stall) can simply
   be re-launched and fast-forwards through everything already fetched */
const CACHE = join(dirname(fileURLToPath(import.meta.url)), ".cache");
mkdirSync(join(CACHE, "meta"), { recursive: true });
const VERIFIED_FILE = join(CACHE, "verified.txt");
const VERIFIED = new Set(existsSync(VERIFIED_FILE)
  ? readFileSync(VERIFIED_FILE, "utf8").split("\n").filter(Boolean) : []);
let failStreak = 0;
const DRY = process.argv.includes("--dry");
const ARCHIVE = "https://archive.org/download/";

/* ── the dial ──────────────────────────────────────────────────────────
 * Hand-picked channels keep their curated programs; harvested channels
 * pull the most-viewed items from an archive.org collection and keep the
 * ones that pass verification. per-channel caps keep schedules varied.
 */

const HAND = (title, year, dur, path, desc, license) =>
  ({ title, year, dur, src: ARCHIVE + path, desc, license });

const BLENDER = "CC-BY · Blender Foundation";

const DIAL = [
  /* One studio, one channel: the Blender open movies — shorts and
     features together, fourteen CC-BY works on a single dial position.
     (They spent the app's first era split across two channels for no
     reason beyond the order they were added.) */
  {
    num: 1, id: "open-cinema", name: "Open Cinema",
    category: "Film", tagline: "The Blender open movie channel", art: "Sintel",
    hand: [
      HAND("Big Buck Bunny", 2008, 596.5, "BigBuckBunny_124/Content/big_buck_bunny_720p_surround.mp4",
        "A giant rabbit takes gentle revenge on three bullying rodents.", BLENDER),
      HAND("Caminandes: The Llama Trilogy", 2013, 386,
        "Caminandesep13BlenderAnimatedShort2013/Caminandes%20%28ep%201-3%29%20Blender%20Animated%20Short%2C%202013.mp4",
        "Koro the llama versus fences, roads and winter: all three shorts back to back.", BLENDER),
      HAND("Glass Half", 2015, 193.3, "GlassHalf1080p/Glass%20Half-1080p.mp4",
        "Two art snobs argue wordlessly about taste in a gallery.", BLENDER),
      HAND("Coffee Run", 2020, 184.7, "coffee-run/Coffee%20Run.mp4",
        "A caffeinated sprint through the memories of a life.", BLENDER),
      HAND("Wing It!", 2023, 238, "wing-it/Wing%20It.mp4",
        "A cat and a dog build a flying machine, against their better judgment.", BLENDER),
      HAND("Elephants Dream", 2006, 653.8, "ElephantsDream/ed_1024_512kb.mp4",
        "Two strange characters explore an infinite machine.", BLENDER),
      HAND("Sintel", 2010, 888, "Sintel/sintel-2048-stereo_512kb.mp4",
        "A lone girl searches for the dragon she once rescued.", BLENDER),
      HAND("Tears of Steel", 2012, 734.1, "Tears-of-Steel/tears_of_steel_720p.mp4",
        "Scientists restage an old heartbreak to save Amsterdam from robots.", BLENDER),
      HAND("Cosmos Laundromat: First Cycle", 2015, 730.6,
        "cosmos-laundromat/Cosmos%20Laundromat.mp4",
        "A suicidal sheep is offered any life he wants.", BLENDER),
      HAND("Spring", 2019, 464.2, "springopenmovie/springopenmovie.mp4",
        "A shepherd girl and her dog face ancient spirits.", BLENDER),
      HAND("Agent 327: Operation Barbershop", 2017, 231.5,
        "agent-327-operation-barbershop/Agent%20327%20Operation%20Barbershop.mp4",
        "The Dutch secret agent walks into a very suspicious barbershop.", BLENDER),
      HAND("Hero", 2018, 236.7, "hero_20260106/hero.mp4",
        "A hand-drawn Grease Pencil duel between a hero and his shadow.", BLENDER),
      HAND("Sprite Fright", 2021, 629.9, "sprite-fright-2021/Sprite%20Fright%20%282021%29.mp4",
        "Mushroom-picking students meet murderously cheerful forest sprites.", BLENDER),
      HAND("Charge", 2022, 262.8, "charge_202601/Charge.mp4",
        "A destitute drifter gambles everything in a power-starved future.", BLENDER)
    ]
  },
  /* Chapter-a-slot cliffhangers: the documented-PD serial canon only —
     Universal's Flash Gordons and Buck Rogers (never renewed), the four
     Republic Dick Tracy serials + RKO Tracy features, the Mascot library
     (Phantom Empire, Hurricane Express, Shadow of the Eagle, The Three
     Musketeers, The Lost City), and Republic's non-renewed rocket cycle
     (Radar Men from the Moon, Zombies of the Stratosphere, King of the
     Rocket Men). Renewed Republic/Columbia serials stay off. */
  {
    num: 2, id: "saturday-serials", name: "Saturday Serials",
    category: "Adventure", tagline: "Cliffhangers by the chapter",
    art: "flash_gordon_ep1",
    hand: [],
    query: 'mediatype:movies AND date:[1932-01-01 TO 1955-12-31] AND title:("flash gordon" OR "buck rogers" OR "dick tracy" OR "phantom empire" OR "radar men" OR "zombies of the stratosphere" OR "king of the rocket men" OR "hurricane express" OR "shadow of the eagle" OR "three musketeers" OR "the lost city" OR "undersea kingdom")',
    titleFilter: /(flash gordon|buck rogers|dick tracy|phantom empire|radar men|zombies of the stratosphere|king of the rocket men|hurricane express|shadow of the eagle|three musketeers|lost city|undersea kingdom)/i,
    want: 64, minDur: 700, maxDur: 5400, maxYear: 1955
  },
  /* The monochrome canon on one channel — films whose black-and-white
     photography IS the work: Dreyer, Murnau, Lang, Wiene, Eisenstein,
     Vertov, Stroheim, Vidor, Keaton, Buñuel, and the photography-defined
     sound-era pictures. Their icons are exempt from the colour-icon pack
     (index-curated) so they present as shot. Entries are SHARED: they play here and stay on their genre
     channels too — membership is additive, not a move. */
  {
    num: 25, id: "monochrome", name: "Black & White Film Night",
    category: "Film", tagline: "The black-and-white canon, as shot",
    art: "the-passion-of-joan-of-arc",
    hand: [],
    ids: [
      { id: "Intolerance", title: "Intolerance", shared: true, year: 1916 },
      { id: "DasKabinettdesDoktorCaligariTheCabinetofDrCaligari", title: "The Cabinet of Dr. Caligari", shared: true, year: 1919 },
      { id: "silent-der-golem-wie-er-in-die-welt-kam-aka-the-golem", title: "The Golem", shared: true, year: 1920 },
      { id: "Nosferatu_most_complete_version_93_mins.", title: "Nosferatu", shared: true, year: 1922 },
      { id: "MyMovie_20190318", title: "Sherlock Jr.", shared: true, year: 1924 },
      { id: "battleship-potemkin-1925_202510", title: "Battleship Potemkin", shared: true, year: 1925 },
      { id: "silent-greed", title: "Greed", shared: true, year: 1925 },
      { id: "the-gold-rush-film-1925", title: "The Gold Rush", shared: true, year: 1925 },
      { id: "The_General_Buster_Keaton", title: "The General", shared: true, year: 1926 },
      { id: "faust.-1926", title: "Faust", shared: true, year: 1926 },
      { id: "metropolis-1927-bdrip-1080p-x-265-dts-hd-ma-5.1-d-0ct-0r-lew-sev", title: "Metropolis", shared: true, year: 1927 },
      { id: "sunrise_1927", title: "Sunrise", shared: true, year: 1927 },
      { id: "the.-crowd.-1928.-king.-vidor-drama.-720p.x-264-classics", title: "The Crowd", shared: true, year: 1928 },
      { id: "the-passion-of-joan-of-arc", title: "The Passion of Joan of Arc", shared: true, year: 1928 },
      { id: "ChelovekskinoapparatomManWithAMovieCamera", title: "Man with a Movie Camera", shared: true, year: 1929 },
      { id: "un-chien-andalou__1929-film__luis_bunuel", title: "Un Chien Andalou", shared: true, year: 1929 },
      { id: "the-blue-angel_1930", title: "The Blue Angel", shared: true, year: 1930 },
      { id: "ScarletStreet", title: "Scarlet Street", shared: true, year: 1945 },
      { id: "TheMan_201607", title: "The Men", shared: true, year: 1950 },
      { id: "clacinonl_SaltOfTheEarth", title: "Salt of the Earth", shared: true, year: 1954 },
      { id: "CarnivalofSouls", title: "Carnival of Souls", shared: true, year: 1962 }
    ],
    want: 21, minDur: 600, maxDur: 11000
  },
  {
    num: 3, id: "cartoon-classics", name: "Cartoon Classics",
    category: "Kids", tagline: "Hand-drawn wonders since 1911", art: "Gertie",
    hand: [
      HAND("Little Nemo", 1911, 634.2, "LittleNemo_548/LittleNemo_512kb.mp4",
        "Winsor McCay's pioneering hand-tinted animation.", "Public domain"),
      HAND("Gertie the Dinosaur", 1914, 738.6, "Gertie/GertietheDinosaur.mp4",
        "The first cartoon star ever.", "Public domain"),
      HAND("Steamboat Willie", 1928, 442.4, "SteamboatWillie/Steamboat%20Willie.mp4",
        "The synchronized-sound sensation that launched a mouse.", "Public domain"),
      HAND("Superman: The Mechanical Monsters", 1941, 613.8,
        "SupermanTheMechanicalMonsters1941/Superman%20-%20The%20Mechanical%20Monsters%20%281941%29.mp4",
        "Fleischer's art-deco Superman battles robot bank-robbers.", "Public domain")
    ],
    collection: "classic_cartoons", want: 60, minDur: 240, maxDur: 1800, maxYear: 1969
  },
  {
    num: 4, id: "creature-feature", name: "Creature Feature",
    category: "Cult", tagline: "Late-night chills, all night",
    art: "Night.Of.The.Living.Dead_1080p",
    hand: [
      HAND("Night of the Living Dead", 1968, 5752.7,
        "Night.Of.The.Living.Dead_1080p/NightOfTheLivingDead_1080p_512kb.mp4",
        "The farmhouse siege that invented the modern zombie.", "Public domain"),
      HAND("House on Haunted Hill", 1959, 4483.2,
        "house_on_haunted_hill_ipod/house_on_haunted_hill_512kb.mp4",
        "Vincent Price offers five guests $10,000 to survive the night.", "Public domain")
    ],
    collection: "SciFi_Horror", want: 80, minDur: 2400, maxDur: 7800, maxYear: 1969,
    titleFilter: /(horror|dead|zombie|vampire|ghost|haunt|terror|monster|creature|devil|blood|corpse|body snatch|carnival of souls|dementia|attack)/i
  },
  {
    num: 5, id: "atomic-theater", name: "Atomic Theater",
    category: "Sci-Fi", tagline: "Flying saucers & fallout, nightly",
    art: "Plan_9_from_Outer_Space_1959",
    hand: [],
    query: 'collection:SciFi_Horror AND mediatype:movies AND title:(space OR planet OR saucer OR mars OR rocket OR atomic OR "outer space" OR robot OR satellite OR venus OR moon)',
    want: 80, minDur: 2400, maxDur: 7800, maxYear: 1969,
    titleFilter: /(planet|space|outer|rocket|saucer|mars|moon|robot|atomic|future|invasion|astro|cosmic|satellite|ufo|venus|brain|teenagers from)/i
  },
  /* Hand-curated star vehicles whose US copyrights were never renewed
     (or lapsed for want of notice) — the documented public-domain canon
     of famous-name features: Bogart, Grant, Hepburn, Stanwyck, Sinatra,
     Astaire, Garland, Welles, Brando, Wayne, Temple, Taylor, Peck…
     Every title here has a well-attested non-renewal/no-notice record.
     Deliberately absent: It's a Wonderful Life (film PD but underlying
     story + music rights reasserted) and the British Hitchcocks (URAA
     restored their US copyrights in 1996). Placed BEFORE the noir and
     genre harvests so the global dedupe assigns these prints here. */
  {
    num: 51, id: "marquee", name: "Marquee",
    category: "Film", tagline: "The big names, up in lights",
    art: "royal_wedding",
    hand: [],
    /* {id, title, year} — several of these items lack year metadata on
       archive.org, and uploader titles carry cast-list cruft, so the
       roster states both. Grant/Hepburn, Bogart, Welles, Sinatra,
       Astaire, Garland, Brando, Wayne, Temple, Stanwyck, Taylor, Peck. */
    ids: [
      { id: "charade-1963-cary-grant-audrey-hepburn-comedy-mystery-romance-thriller-full-movie", title: "Charade", year: 1963 },
      { id: "BeatTheDevil1953", title: "Beat the Devil", year: 1953 },
      { id: "TheStranger_0", title: "The Stranger", year: 1946 },
      { id: "ScarletStreet", title: "Scarlet Street", year: 1945 },
      { id: "Detour", title: "Detour", year: 1945 },
      { id: "thoseguysontheradio_gmail_Doa", title: "D.O.A.", year: 1949 },
      { id: "suddenly", title: "Suddenly", year: 1954 },
      { id: "Hitch_Hiker", title: "The Hitch-Hiker", year: 1953 },
      { id: "MyManGodfrey1936", title: "My Man Godfrey", year: 1936 },
      { id: "NothingSacred", title: "Nothing Sacred", year: 1937 },
      { id: "AStarIsBorn", title: "A Star Is Born", year: 1937 },
      { id: "meet_john_doe", title: "Meet John Doe", year: 1941 },
      { id: "made_for_each_other_film", title: "Made for Each Other", year: 1939 },
      { id: "penny_serenade", title: "Penny Serenade", year: 1941 },
      { id: "humanbondage", title: "Of Human Bondage", year: 1934 },
      { id: "LoveAffair", title: "Love Affair", year: 1939 },
      { id: "TheFrontPage1931AdolpheMenjouPatOBrienLewismiles", title: "The Front Page", year: 1931 },
      { id: "afarewelltoarms1932garycooper", title: "A Farewell to Arms", year: 1932 },
      { id: "LifeWithFather", title: "Life with Father", year: 1947 },
      { id: "till_the_clouds_roll_by", title: "Till the Clouds Roll By", year: 1946 },
      { id: "royal_wedding", title: "Royal Wedding", year: 1951 },
      { id: "second_chorus_1940", title: "Second Chorus", year: 1940 },
      { id: "TheLittlePrincess1939", title: "The Little Princess", year: 1939 },
      { id: "angel_and_the_badman", title: "Angel and the Badman", year: 1947 },
      { id: "886-the-outlaw", title: "The Outlaw", year: 1943 },
      { id: "Cyrano_DeBergerac", title: "Cyrano de Bergerac", year: 1950 },
      { id: "fatherslittledividend", title: "Father's Little Dividend", year: 1951 },
      { id: "oneeyedjacks1961_202001", title: "One-Eyed Jacks", year: 1961 },
      { id: "kansascityconfidencial", title: "Kansas City Confidential", year: 1952 },
      { id: "Kilimanjaro", title: "The Snows of Kilimanjaro", year: 1952 },
      { id: "JungleBook", title: "Jungle Book", year: 1942 },
      { id: "TheSoutherner", title: "The Southerner", year: 1945 },
      /* second sweep: best-of-lists canon (Sight & Sound-era polls, AFI,
         Film Registry) cross-checked against the documented-PD record */
      { id: "SvengaliJohnBarrymoreBKCap1931", title: "Svengali", year: 1931 },
      { id: "rain1932", title: "Rain", year: 1932 },
      { id: "gullivers_travels1939", title: "Gulliver's Travels", year: 1939 },
      { id: "Our_Town", title: "Our Town", year: 1940 },
      { id: "angel_on_my_shoulder", title: "Angel on My Shoulder", year: 1946 },
      { id: "Strange_Woman_movie", title: "The Strange Woman", year: 1946 },
      { id: "TheMan_201607", title: "The Men", year: 1950 },
      { id: "clacinonl_SaltOfTheEarth", title: "Salt of the Earth", year: 1954 }
    ],
    want: 40, minDur: 2400, maxDur: 10000
  },
  {
    num: 6, id: "shadow-street", name: "Shadow Street",
    category: "Drama", tagline: "Shadows, cigarettes and bad decisions",
    art: "Film_Noir",
    hand: [],
    collection: "Film_Noir", want: 140, minDur: 2800, maxDur: 7800, maxYear: 1963
  },
  {
    num: 7, id: "screwball-screen", name: "Screwball Screen",
    category: "Comedy", tagline: "Fast talk from the golden age",
    art: "his_girl_friday",
    hand: [
      HAND("His Girl Friday", 1940, 5504.5, "his_girl_friday/his_girl_friday_512kb.mp4",
        "The fastest dialogue ever filmed.", "Public domain")
    ],
    collection: "Comedy_Films", want: 120, minDur: 2400, maxDur: 7800, maxYear: 1969
  },
  {
    num: 8, id: "retro-vault", name: "Retro Vault",
    category: "Documentary", tagline: "Ephemeral films from the Prelinger vaults",
    art: "DuckandC1951",
    hand: [
      HAND("Duck and Cover", 1951, 555.4, "DuckandC1951/DuckandC1951_512kb.mp4",
        "Bert the Turtle teaches Cold-War civil defense.", "Public domain · Prelinger"),
      HAND("The Home Economics Story", 1951, 748.4, "HomeEcon1951/HomeEcon1951_512kb.mp4",
        "A gloriously earnest recruiting film.", "Public domain · Prelinger")
    ],
    collection: "prelinger", want: 96, minDur: 240, maxDur: 2400
  },
  {
    num: 9, id: "newsreel-nine", name: "Newsreel Nine",
    category: "News", tagline: "History as it happened, twice a week",
    art: "universal_newsreels",
    hand: [],
    collection: "universal_newsreels", want: 72, minDur: 120, maxDur: 1500
  },
  {
    num: 10, id: "tube-classics", name: "Tube Classics",
    category: "Entertainment", tagline: "The golden age of the small screen",
    art: "classic_tv",
    hand: [],
    collection: "classic_tv", want: 180, minDur: 1200, maxDur: 3900, maxYear: 1969,
    /* classic_tv is full of infringing uploads — allow only well-known
       public-domain-era shows */
    titleFilter: /(bonanza|lone ranger|beverly hillbillies|dick van dyke|petticoat junction|dragnet|sherlock holmes|one step beyond|racket squad|ozzie and harriet|jack benny|burns and allen|lucy|milton berle|texaco|your show of shows|studio one|suspense|lights out|robin hood|flash gordon|front page detective|four star|public defender|district attorney|gang busters|annie oakley|cisco kid|colonel march|ramar of the jungle|telephone time|schlitz playhouse|ford the(atre|ater)|my little margie|the goldbergs|life of riley|martin kane|danger(?!ous)|crusader)/i
  },
  /* Everything published through 1930 is US public domain (as of 2026),
     so these two channels sweep the silent/early-sound theatrical era
     comprehensively: features on one dial position, one/two-reelers on
     another. requireYear keeps the bright line honest. */
  {
    num: 11, id: "picture-palace", name: "Picture Palace",
    category: "Film", tagline: "Features from cinema's first three decades, to 1919",
    art: "silent_films",
    hand: [],
    /* The pre-1931 theatrical sweep, split by era so each channel's
       schedule cycles in days rather than months — one 1,350-program
       channel meant any given film aired about once a quarter. */
    ids: [
      { id: "Intolerance", title: "Intolerance", year: 1916 }
    ],
    query: "collection:(feature_films OR silent_films) AND mediatype:movies AND date:[1891-01-01 TO 1919-12-31]",
    want: 600, minDur: 2400, maxDur: 11000, maxYear: 1919, requireYear: true
  },
  {
    num: 111, id: "silent-twenties", name: "Silent Twenties",
    category: "Film", tagline: "Features 1920–1925",
    art: "nanookOfTheNorth1922",
    hand: [],
    ids: [
      { id: "MyMovie_20190318", title: "Sherlock Jr.", year: 1924 },
      { id: "the-gold-rush-film-1925", title: "The Gold Rush", year: 1925 },
      { id: "nanookOfTheNorth1922", title: "Nanook of the North", year: 1922 }
    ],
    query: "collection:(feature_films OR silent_films) AND mediatype:movies AND date:[1920-01-01 TO 1925-12-31]",
    want: 600, minDur: 2400, maxDur: 11000, maxYear: 1925, requireYear: true
  },
  {
    num: 112, id: "late-silents", name: "Late Silents",
    category: "Film", tagline: "The craft at its height, 1926–1928",
    art: "the-passion-of-joan-of-arc",
    hand: [],
    ids: [
      { id: "the-passion-of-joan-of-arc", title: "The Passion of Joan of Arc", year: 1928 }
    ],
    query: "collection:(feature_films OR silent_films) AND mediatype:movies AND date:[1926-01-01 TO 1928-12-31]",
    want: 600, minDur: 2400, maxDur: 11000, maxYear: 1928, requireYear: true
  },
  {
    num: 113, id: "talking-pictures", name: "Talking Pictures",
    category: "Film", tagline: "1929–1930: sound arrives",
    art: "the-blue-angel_1930",
    hand: [],
    query: "collection:(feature_films OR silent_films) AND mediatype:movies AND date:[1929-01-01 TO 1930-12-31]",
    want: 600, minDur: 2400, maxDur: 11000, maxYear: 1930, requireYear: true
  },
  {
    num: 115, id: "five-cent-cinema", name: "Five-Cent Cinema",
    category: "Film", tagline: "Shorts from the dawn of cinema, to 1917",
    art: "silent_films",
    hand: [],
    query: "collection:(feature_films OR silent_films) AND mediatype:movies AND date:[1891-01-01 TO 1917-12-31]",
    want: 300, minDur: 60, maxDur: 2400, maxYear: 1917, requireYear: true
  },
  /* The pre-Code talkies, 1931 to the Code's enforcement in mid-1934 —
     the era's famous studio pictures were renewed (denied above), but
     the poverty-row and lapsed-major output is a deep PD seam of
     exactly the era's quirkiness. Every harvested title still passes
     the eyeball review before shipping. */
  {
    num: 114, id: "pre-code", name: "Pre-Code Parlor",
    category: "Film", tagline: "1931–1934: before the Code",
    art: "humanbondage",
    hand: [],
    query: "collection:(feature_films OR Film_Noir OR Comedy_Films OR SciFi_Horror) AND mediatype:movies AND date:[1931-01-01 TO 1934-12-31]",
    want: 250, minDur: 2400, maxDur: 9600, maxYear: 1934, requireYear: true
  },
  {
    num: 120, id: "two-reelers", name: "Two-Reelers",
    category: "Film", tagline: "Shorts 1918–1930",
    art: "silent_films",
    hand: [],
    query: "collection:(feature_films OR silent_films) AND mediatype:movies AND date:[1918-01-01 TO 1930-12-31]",
    want: 300, minDur: 60, maxDur: 2400, maxYear: 1930, requireYear: true
  },
  {
    num: 116, id: "western-roundup", name: "Western Roundup",
    category: "Western", tagline: "Six-guns and sagebrush, sunup to sundown",
    art: "feature_films",
    hand: [],
    query: "collection:feature_films AND mediatype:movies AND subject:western",
    want: 160, minDur: 2400, maxDur: 8400, maxYear: 1963
  },
  {
    num: 117, id: "mystery-playhouse", name: "Mystery Playhouse",
    category: "Mystery", tagline: "Whodunits, sleuths and locked rooms",
    art: "Film_Noir",
    hand: [],
    query: "collection:feature_films AND mediatype:movies AND subject:mystery",
    want: 140, minDur: 2400, maxDur: 8400, maxYear: 1963
  },
  {
    num: 118, id: "drama-matinee", name: "Drama Matinee",
    category: "Drama", tagline: "The big feelings, twice nightly",
    art: "feature_films",
    hand: [],
    query: "collection:feature_films AND mediatype:movies AND subject:drama",
    want: 180, minDur: 2700, maxDur: 9600, maxYear: 1963
  },
  {
    num: 119, id: "toon-vault", name: "Toon Vault",
    category: "Cartoons & Animation", tagline: "Deeper cuts from the ink-and-paint era",
    art: "vintage_cartoons",
    hand: [],
    collection: "vintage_cartoons", want: 60, minDur: 180, maxDur: 1800, maxYear: 1969
  },
  {
    num: 12, id: "trailer-park", name: "Trailer Park",
    category: "Entertainment", tagline: "Coming attractions, forever",
    art: "movie_trailers",
    hand: [],
    /* the movie_trailers collection is a swamp; verified classics + a
       year-bounded query for golden-age attractions */
    ids: [
      "SitaSingsTheBluesTrailer2008-640x360", "NightOfTheLivingDeadTrailer",
      "RevengeOfTheCreatureTrailer", "BananasTrailer_733", "FantasticPlanetTrailer"
    ],
    query: 'collection:movie_trailers AND mediatype:movies AND title:(trailer) AND date:[1930-01-01 TO 1977-12-31]',
    want: 32, minDur: 45, maxDur: 360, maxYear: 1977,
    titleFilter: /trailer/i
  },
  {
    num: 13, id: "moon-tv", name: "Moon TV",
    category: "Science & Tech", tagline: "One small step, on a loop",
    art: "youtube-S9HdPi9Ikhk",
    hand: [
      HAND("Apollo 11 Moonwalk (Restored)", 1969, 10950, "youtube-S9HdPi9Ikhk/S9HdPi9Ikhk.mp4",
        "NASA's restored original EVA television.", "Public domain · NASA")
    ],
    collection: "nasa", want: 20, minDur: 240, maxDur: 4000
  }
];

/* ── plumbing ─────────────────────────────────────────────────────── */

/* keep the default dial family-friendly and clear of obvious rip uploads */
const GLOBAL_EXCLUDE = /(sex|porn|milf|erot|nude|xxx|kama sutra|\bdesire\b|psycho cat|ramrodder|women are bad|snuff|terrifying girls|girl boss|\bteasers\b|delinquent|exploitation|hbo|netflix|complete series|complete docuseries|ken.?\s*burns|world at war|blu.?ray|1080p rip|x26[45]|colou?rized)/i;

/* rip-smelling IDENTIFIERS (titles are often scrubbed clean while the
   identifier still says BrRip): scene-release markers mean a modern
   home-video master, not an archival print */
const ID_EXCLUDE = /(x.?26[45]|blu.?ray|yts\.?\.?mx|hevc|b[dr].?rip|dvdrip|web.?rip|webdl|handjob)/i;

/* Rights denylist. The harvest queries rank by popularity, which favours
   exactly the famous films that are still owned. These are features whose
   US copyright is well documented as ALIVE — renewed by the studio, or a
   post-1930 foreign film restored by URAA in 1996 (UK, Japanese, French,
   Spanish, Czech, German productions). Matching is on normalised title
   (exact, or first-word-boundary prefix) so every re-upload is caught.
   Deliberately NOT here: the documented non-renewal canon (McLintock!,
   Road to Bali, MGM lapses, Corman, Sudden Fear, The Big Lift…) and the
   pre-1931 European silents, whose URAA status is a long-standing gray
   zone that US distributors have treated as PD for decades. */
const DENY_TITLES = [
  // famous renewed US studio features
  "dr strangelove", "from here to eternity", "sabrina", "niagara", "laura",
  "double indemnity", "day the earth stood still", "manchurian candidate",
  "killing", "killers kiss", "kiss me deadly", "big heat", "ace in the hole",
  "dont bother to knock", "pickup on south street", "panic in the streets",
  "house on telegraph hill", "diplomatic courier", "deadline usa", "deadline u s a",
  "journey to the center of the earth", "harvey", "night and the city",
  "abbott and costello meet the invisible man", "pit and the pendulum",
  "haunted palace", "detective story", "desperate hours", "gunfighter",
  "outcasts of poker flat", "gambler from natchez", "convicted",
  "harriet craig", "fat man", "man in the dark", "young savages",
  "file on thelma jordan", "file on thelma jordon", "space master x 7",
  "creature walks among us", "deadly mantis", "monolith monsters",
  "monster on campus", "boomerang", "house of strangers",
  "murder by contract", "killer that stalked new york",
  "dr goldfoot and the bikini machine",
  // URAA-restored foreign features (post-1930)
  "ladykillers", "carry on cruising", "carry on cabby", "tiger bay",
  "room at the top", "browning version", "an inspector calls",
  "never take candy from a stranger", "day the earth caught fire",
  "father brown the detective", "golden salamander", "touch of larceny",
  "two headed spy", "footsteps in the fog", "good die young",
  "another mans poison", "mr denning drives north", "one that got away",
  "hell in korea", "limping man", "black abbot", "night creatures",
  "devil girl from mars", "strange world of planet x", "x from outer space",
  "goke body snatcher from hell", "destroy all monsters", "back room boy",
  "sanjuro", "good morning", "tokyo story", "ugetsu", "gate of hell",
  "wages of fear", "wild strawberries", "harakiri", "high and low",
  "drunken angel", "elevator to the gallows", "viridiana", "daisies",
  "panther panchali", "pather panchali", "aparajito", "apur sansay",
  "apur sansar", "wicked as they come", "stray dog",
  "men who tread on", "blonde in a white car",
  // renewed by UA in 1983 — a standard "everyone assumes it's PD" trap
  "night of the hunter",
  // famous pre-Code studio properties, all renewed: Universal horror,
  // Warner gangster/musicals, Paramount Marx/West/Sternberg, MGM
  // prestige, RKO's ape — the popularity ranking reaches for exactly
  // these. The documented-PD pre-Code canon stays harvestable.
  "king kong", "son of kong", "duck soup", "horse feathers",
  "monkey business", "animal crackers", "she done him wrong",
  "im no angel", "42nd street", "gold diggers of 1933",
  "footlight parade", "public enemy", "little caesar", "scarface",
  "freaks", "dracula", "frankenstein", "mummy", "invisible man",
  "island of lost souls", "murders in the rue morgue", "black cat",
  "old dark house", "trouble in paradise", "design for living",
  "grand hotel", "dinner at eight", "red dust", "red headed woman",
  "baby face", "employees entrance", "tarzan the ape man",
  "tarzan and his mate", "morocco", "blonde venus", "shanghai express",
  "dishonored", "sign of the cross", "cleopatra",
  "it happened one night", "queen christina", "thin man"
];
/* generically-titled or one-off strays: denied by identifier so the title
   stays available to legitimate uploads (Maniac 1934 is PD; Naruse's Wife
   is not) */
const DENY_IDS = new Set([
  "scandal_202012",              // Scandal (1950, Kurosawa — URAA)
  "wife_20201211",               // Wife (1953, Naruse — URAA)
  "Intimidation",                // Intimidation (1960, Nikkatsu — URAA)
  "maniac_202107",               // Maniac (1963, Hammer/Columbia)
  "the-web-1947",                // The Web (1947, Universal — renewed)
  "larceny1948",                 // Larceny (1948, Universal — renewed)
  "Vengence_of_the_Zombies",     // Vengeance of the Zombies (1973)
  "my-movie_20210607",           // junk "My Movie" upload
  "TheEmperorNortonBonanza1966", // Bonanza 1966 (post-1963: auto-renewed era)
  "HouseOnBareMountain"          // 1962 nudie-cutie — past the family line
]);
const isDeniedTitle = (nt) =>
  DENY_TITLES.some((e) => nt === e || nt.startsWith(e + " "));

const normTitle = (t) => String(t || "").toLowerCase()
  .replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim()
  .replace(/^the /, "").replace(/ the$/, "");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJSON(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (r.ok) { failStreak = 0; return await r.json(); }
    } catch {}
    await sleep(1500 * (i + 1));
  }
  // repeated failures usually mean archive.org is throttling us: back off hard
  if (++failStreak >= 4) {
    console.log(`  (upstream unhappy — cooling off 90s, streak ${failStreak})`);
    await sleep(90000);
  }
  return null;
}

async function getMeta(id) {
  const f = join(CACHE, "meta", encodeURIComponent(id) + ".json");
  if (existsSync(f)) { try { return JSON.parse(readFileSync(f, "utf8")); } catch {} }
  const j = await getJSON(`https://archive.org/metadata/${id}`);
  if (j?.files) { try { writeFileSync(f, JSON.stringify(j)); } catch {} }
  await sleep(400);          // polite pacing on cache misses only
  return j;
}

async function search(query, rows) {
  const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(query)}` +
    `&fl[]=identifier&fl[]=title&fl[]=year&fl[]=downloads&fl[]=avg_rating&fl[]=num_reviews` +
    `&sort[]=downloads+desc&rows=${rows}&output=json`;
  const j = await getJSON(url);
  return j?.response?.docs ?? [];
}

function parseLen(s) {
  if (s == null) return NaN;
  const str = String(s);
  if (/^[\d.]+$/.test(str)) return parseFloat(str);
  const parts = str.split(":").map(Number);
  if (parts.some(isNaN)) return NaN;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

/* pick a light, streamable h.264 file; also note a bigger one for "best" */
function pickFiles(files) {
  const mp4s = files.filter((f) => /\.mp4$/i.test(f.name) && f.size);
  if (!mp4s.length) return null;
  const score = (f) => {
    const n = f.name.toLowerCase();
    if (n.endsWith("_512kb.mp4")) return 0;          // classic h.264 derivative
    if (n.endsWith(".ia.mp4")) return 1;             // modern ia derivative
    return 2 + Math.min(1, +f.size / 4e8);           // originals: prefer smaller
  };
  mp4s.sort((a, b) => score(a) - score(b) || +a.size - +b.size);
  const lo = mp4s[0];
  const hi = mp4s.filter((f) => f !== lo && +f.size > +lo.size * 1.4)
                 .sort((a, b) => +a.size - +b.size)[0];
  return { lo, hi };
}

async function verify(url) {
  if (VERIFIED.has(url)) return true;
  try {
    const r = await fetch(url, {
      headers: { Range: "bytes=0-0" },
      signal: AbortSignal.timeout(25000), redirect: "follow"
    });
    const ok = r.status === 206 || r.status === 200;
    if (ok) { VERIFIED.add(url); try { appendFileSync(VERIFIED_FILE, url + "\n"); } catch {} }
    await sleep(250);
    return ok;
  } catch { return false; }
}

function cleanTitle(t) {
  let s = String(t || "").replace(/\s+/g, " ").trim();
  // "1951 - Detective Story - …" uploader year prefixes
  s = s.replace(/^(19|20)\d\d\s*[-–—:]\s*/, "");
  // "Title (1953) Richard Widmark, Jean …" — cut cast/blurb tails at the
  // first bracketed year ("Airport 1975"-style unbracketed years survive)
  const m = s.match(/^(.{8,}?)\s*[([]\s*(19|20)\d\d\b/);
  if (m) s = m[1];
  else s = s.replace(/\s*[([]\s*(19|20)\d\d\s*[)\]]\s*$/, "");
  // trailing uploader markers
  s = s.replace(/\s*[-–|]?\s*[([]?\s*(vose|widescreen|hd quality|full movie|ipod( and flash.*)?|hd)\s*[)\]]?\s*$/i, "");
  return s.replace(/\s+/g, " ").trim().slice(0, 70);
}

async function harvestChannel(ch, taken, seenTitles) {
  if (!ch.want || (!ch.collection && !ch.ids && !ch.query)) return [];
  const q = ch.query || (ch.collection && `collection:${ch.collection} AND mediatype:movies`);
  const found = q ? await search(q, ch.want * 6) : [];
  /* priority: popularity, audience rating, and recency within the era —
     proxies for colour, print quality and famous casts — without ever
     moving the free/open year gates */
  const prio = (d) =>
    Math.log10((+d.downloads || 0) + 1) +
    (+d.avg_rating || 0) * 0.5 +
    (parseInt(d.year) ? Math.max(0, Math.min(1, (parseInt(d.year) - 1900) / 60)) * 1.5 : 0);
  found.sort((a, b) => prio(b) - prio(a));
  const docs = [
    /* hand ids: plain string, or {id, title, year} when archive.org's own
       metadata is missing/ugly — overrides flow through the normal gates */
    ...(ch.ids || []).map((x) => typeof x === "string"
      ? { identifier: x, hand: true }
      : { identifier: x.id, title: x.title, year: x.year, hand: true, shared: x.shared }),
    ...found
  ];
  const out = [];
  const rejects = {};
  const reject = (why) => { rejects[why] = (rejects[why] || 0) + 1; };
  /* title dedupe with a word-boundary prefix rule, so "Night of the Living
     Dead (1968) English FULL HD" and the iPod re-encode collapse onto the
     copy already on the dial */
  const isDupTitle = (nt) => {
    if (seenTitles.has(nt)) return true;
    if (nt.length < 10) return false;
    for (const s of seenTitles)
      if (s.length >= 10 && (s.startsWith(nt + " ") || nt.startsWith(s + " "))) return true;
    return false;
  };
  for (const d of docs) {
    if (out.length >= ch.want) break;
    if (!d.identifier || taken.has(d.identifier)) { reject("dup-id"); continue; }
    if (DENY_IDS.has(d.identifier) || (!d.hand && ID_EXCLUDE.test(d.identifier))) { reject("denied"); continue; }
    const searchTitle = String(d.title || "");
    if (d.title !== undefined) {
      if (GLOBAL_EXCLUDE.test(searchTitle)) { reject("excluded"); continue; }
      if (isDeniedTitle(normTitle(cleanTitle(searchTitle)))) { reject("denied"); continue; }
      if (ch.titleFilter && !ch.titleFilter.test(searchTitle)) { reject("filter"); continue; }
    }
    const meta = await getMeta(d.identifier);
    if (!meta?.files) { reject("no-meta"); continue; }
    const title = cleanTitle(d.title || meta.metadata?.title) || d.identifier;
    if (GLOBAL_EXCLUDE.test(title)) { reject("excluded"); continue; }
    if (isDeniedTitle(normTitle(title))) { reject("denied"); continue; }
    if (isDupTitle(normTitle(title))) { reject("dup-title"); continue; }
    const picked = pickFiles(meta.files);
    if (!picked) { reject("no-mp4"); continue; }
    const dur = parseLen(picked.lo.length) ||
                parseLen(meta.files.find((f) => parseLen(f.length))?.length);
    if (!dur || dur < ch.minDur || dur > ch.maxDur) { reject("duration"); continue; }
    const year = parseInt(d.year) || parseInt(meta.metadata?.year) ||
                 parseInt(String(meta.metadata?.date || "").slice(0, 4)) || undefined;
    if (ch.requireYear && !year) { reject("no-year"); continue; }
    if (ch.maxYear && year && year > ch.maxYear) { reject("too-new"); continue; }
    const enc = (n) => n.split("/").map(encodeURIComponent).join("/");
    const src = `${ARCHIVE}${d.identifier}/${enc(picked.lo.name)}`;
    if (!(await verify(src))) { reject("verify"); continue; }
    /* shared entries appear on this channel without claiming the item:
       its home channel keeps (or re-harvests) it too */
    if (!d.shared) {
      taken.add(d.identifier);
      seenTitles.add(normTitle(title));
    }
    out.push({
      title,
      year, dur: Math.round(dur * 10) / 10,
      src,
      srcHi: picked.hi ? `${ARCHIVE}${d.identifier}/${enc(picked.hi.name)}` : undefined,
      art: `https://archive.org/services/img/${d.identifier}`,
      desc: "",
      license: "via archive.org"
    });
    process.stdout.write(`  + ${ch.id}: ${out.length}/${ch.want} ${d.identifier}\n`);
  }
  if (out.length < ch.want) console.log(`  rejects: ${JSON.stringify(rejects)}`);
  return out;
}

/* ── main ─────────────────────────────────────────────────────────── */

/* INTERIM=1: moderated caps for a mid-harvest release cut from the disk
   cache — the full-fat run keeps its own numbers */
if (process.env.INTERIM) {
  for (const ch of DIAL) {
    if (ch.id === "picture-palace") ch.want = 400;
    if (ch.id === "five-cent-cinema") ch.want = 120;
  }
  console.log("(interim caps: picture-palace 400, five-cent-cinema 120)");
}

const taken = new Set();
const seenTitles = new Set();
const channels = [];

for (const ch of DIAL) {
  console.log(`── ${ch.num} ${ch.name} ${ch.collection ? `(harvest ${ch.collection})` : "(hand-picked)"}`);
  ch.hand.forEach((p) => {
    const m = p.src.match(/download\/([^/]+)\//);
    if (m) taken.add(m[1]);
    seenTitles.add(normTitle(p.title));
    p.art = p.art || `https://archive.org/services/img/${m ? m[1] : ""}`;
  });
  const harvested = await harvestChannel(ch, taken, seenTitles);
  const programs = [...ch.hand, ...harvested]
    .sort((a, b) => (a.year || 9999) - (b.year || 9999) || a.title.localeCompare(b.title));
  if (!programs.length) { console.log(`  !! ${ch.id} came up empty — skipped`); continue; }
  channels.push({
    num: 0, id: ch.id, name: ch.name, category: ch.category,
    tagline: ch.tagline, art: `https://archive.org/services/img/${ch.art}`,
    programs
  });
  console.log(`  = ${programs.length} programs`);
}

/* renumber contiguously so keypad zapping has no gaps */
channels.forEach((c, i) => { c.num = i + 1; });

const totalPrograms = channels.reduce((s, c) => s + c.programs.length, 0);
const totalHours = channels.reduce((s, c) => s + c.programs.reduce((x, p) => x + p.dur, 0), 0) / 3600;
console.log(`\nDial: ${channels.length} channels, ${totalPrograms} programs, ${totalHours.toFixed(1)} hours of airtime`);

const CATS = [
  { id: "explore", label: "Explore", icon: "◉" },
  { id: "my", label: "My Channels", icon: "★" },
  ...[...new Set(channels.map((c) => c.category))].map((c) => ({ id: c, label: c, icon: "▸" }))
];

const banner = `/*
 * TVP/2007 — channel lineup.
 * GENERATED by tvp/tools/curate.mjs on ${new Date().toISOString().slice(0, 10)} — edit that script, not this file.
 * ${channels.length} channels · ${totalPrograms} programs · ${totalHours.toFixed(1)} hours of free/open video,
 * all verified range-streamable from the Internet Archive at harvest time.
 * Hand-picked programs carry license notes; harvested items are from
 * archive.org public collections (Prelinger, Film Noir, SciFi_Horror, …).
 */
`;

const body = banner +
  "\nconst CHANNELS = " + JSON.stringify(channels, null, 1).replace(/"([a-zA-Z_$][\w$]*)":/g, "$1:") + ";\n" +
  "\n/* EPG category rail — the dial's 2007-flavoured category vocabulary */" +
  "\nconst EPG_CATEGORIES = " + JSON.stringify(CATS, null, 1).replace(/"([a-zA-Z_$][\w$]*)":/g, "$1:") + ";\n" +
  "\n/* Broadcast epoch: 16 Jan 2007 — the moment this dial's clock started ticking. */" +
  "\nconst BROADCAST_EPOCH = Date.UTC(2007, 0, 16, 0, 0, 0);\n";

if (DRY) {
  console.log("(dry run — not writing)");
} else {
  writeFileSync(OUT, body);
  console.log("wrote " + OUT);
}
