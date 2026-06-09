/**
 * Arabic → Latin for Moroccan city matching. Order forms often carry the ville
 * in Arabic script (مكناس, الدار البيضاء, طنجة…). `cityKey` strips everything
 * outside `a-z0-9`, so without this an Arabic ville collapses to "" and never
 * matches the (Latin) Ozon catalog. We first try a curated city dictionary, then
 * fall back to a letter-by-letter transliteration so the fuzzy / closest passes
 * still get something usable.
 *
 * Pure + dependency-free so it can be unit-tested and reused on both ville and
 * address text.
 */

/** Fold Arabic spelling variants so dictionary keys match real-world input. */
export function normalizeArabic(s: unknown): string {
  return String(s ?? "")
    .replace(/[ً-ٰٟ]/g, "") // harakat / Quranic marks
    .replace(/ـ/g, "") // tatweel
    .replace(/[آأإٱ]/g, "ا") // آأإٱ → ا
    .replace(/[ىی]/g, "ي") // ى / ی → ي
    .replace(/ة/g, "ه") // ة → ه
    .replace(/ؤ/g, "و") // ؤ → و
    .replace(/ئ/g, "ي") // ئ → ي
    .replace(/ک/g, "ك") // ک → ك
    .replace(/ء/g, "") // standalone hamza
    .replace(/\s+/g, " ")
    .trim();
}

/** Per-letter fallback when a token isn't in the dictionary. */
const LETTER: Record<string, string> = {
  "ا": "a", "ب": "b", "ت": "t", "ث": "th", "ج": "j",
  "ح": "h", "خ": "kh", "د": "d", "ذ": "d", "ر": "r",
  "ز": "z", "س": "s", "ش": "ch", "ص": "s", "ض": "d",
  "ط": "t", "ظ": "d", "ع": "a", "غ": "gh", "ف": "f",
  "ق": "q", "ك": "k", "ل": "l", "م": "m", "ن": "n",
  "ه": "h", "و": "ou", "ي": "i",
};

function transliterateToken(t: string): string {
  let out = "";
  for (const ch of t) {
    if (LETTER[ch] != null) out += LETTER[ch];
    else if (/[a-z0-9]/i.test(ch)) out += ch; // keep Latin in mixed strings
  }
  return out;
}

/**
 * Curated Moroccan cities (and common variants) keyed by their Arabic spelling.
 * Values are plain-Latin canonical names; `cityKey` later folds accents/case so
 * "fes" matches a catalog "Fès". Keys are normalized at load via normalizeArabic.
 */
const RAW_CITY: Record<string, string> = {
  "الدار البيضاء": "casablanca", "الدارالبيضاء": "casablanca", "البيضاء": "casablanca",
  "كازا": "casablanca", "كازابلانكا": "casablanca", "الرباط": "rabat", "رباط": "rabat",
  "سلا": "sale", "تمارة": "temara", "الصخيرات": "skhirat", "بوزنيقة": "bouznika",
  "القنيطرة": "kenitra", "قنيطرة": "kenitra", "مكناس": "meknes", "فاس": "fes",
  "مراكش": "marrakech", "طنجة": "tanger", "أكادير": "agadir", "اكادير": "agadir",
  "وجدة": "oujda", "تطوان": "tetouan", "آسفي": "safi", "اسفي": "safi",
  "المحمدية": "mohammedia", "خريبكة": "khouribga", "بني ملال": "beni mellal",
  "الجديدة": "el jadida", "جديدة": "el jadida", "تازة": "taza", "الناظور": "nador",
  "الناضور": "nador", "ناظور": "nador", "سطات": "settat", "برشيد": "berrechid",
  "خنيفرة": "khenifra", "العرائش": "larache", "عرائش": "larache", "الخميسات": "khemisset",
  "خميسات": "khemisset", "كلميم": "guelmim", "غلميم": "guelmim", "الراشيدية": "errachidia",
  "الرشيدية": "errachidia", "ورزازات": "ouarzazate", "تارودانت": "taroudant",
  "الصويرة": "essaouira", "صويرة": "essaouira", "بنسليمان": "benslimane",
  "سيدي قاسم": "sidi kacem", "سيدي سليمان": "sidi slimane", "وزان": "ouazzane",
  "تاونات": "taounate", "الحسيمة": "al hoceima", "حسيمة": "al hoceima", "بركان": "berkane",
  "تاوريرت": "taourirt", "جرسيف": "guercif", "ميدلت": "midelt", "الداخلة": "dakhla",
  "داخلة": "dakhla", "العيون": "laayoune", "عيون": "laayoune", "طانطان": "tan tan",
  "طان طان": "tan tan", "سيدي إفني": "sidi ifni", "سيدي افني": "sidi ifni",
  "تيزنيت": "tiznit", "قلعة السراغنة": "kelaa des sraghna", "اليوسفية": "youssoufia",
  "يوسفية": "youssoufia", "أزرو": "azrou", "ازرو": "azrou", "إفران": "ifrane",
  "افران": "ifrane", "زاكورة": "zagora", "تنغير": "tinghir", "شفشاون": "chefchaouen",
  "مارتيل": "martil", "الفنيدق": "fnideq", "المضيق": "mdiq", "دمنات": "demnate",
  "سيدي بنور": "sidi bennour", "الحاجب": "el hajeb", "حاجب": "el hajeb", "صفرو": "sefrou",
  "وادي زم": "oued zem", "قصبة تادلة": "kasba tadla", "أزيلال": "azilal", "ازيلال": "azilal",
  "ميسور": "missour", "الفقيه بن صالح": "fquih ben salah", "الفقيه بنصالح": "fquih ben salah",
  "بنجرير": "ben guerir", "بن جرير": "ben guerir", "تاهلة": "tahla", "بني انصار": "beni ansar",
  "زايو": "zaio", "السمارة": "smara", "بوجدور": "boujdour", "طاطا": "tata",
  "تارجيست": "targuist", "الحوزية": "el haouzia",
  "سوق الأربعاء": "souk larbaa", "أولاد تايمة": "oulad teima", "اولاد تايمة": "oulad teima",
  "بيوكرى": "biougra", "إنزكان": "inezgane", "انزكان": "inezgane", "أيت ملول": "ait melloul",
  "ايت ملول": "ait melloul", "تيفلت": "tiflet", "الرماني": "rommani",
};

const AR_CITY: Record<string, string> = {};
for (const [k, v] of Object.entries(RAW_CITY)) AR_CITY[normalizeArabic(k)] = v;

const AL = "ال"; // "ال" (definite article prefix)

function lookupToken(t: string): string | null {
  if (AR_CITY[t]) return AR_CITY[t];
  if (t.startsWith(AL) && t.length > 4 && AR_CITY[t.slice(2)]) return AR_CITY[t.slice(2)];
  return null;
}

/** True when the string contains any Arabic-script character. */
export function hasArabic(s: unknown): boolean {
  return /[؀-ۿ]/.test(String(s ?? ""));
}

/**
 * Convert an Arabic ville/address to Latin. Tries the full phrase, then the
 * space-joined phrase, then resolves token-by-token (dictionary → "ال"-stripped
 * → letter transliteration). Latin input is returned unchanged.
 */
export function arabicToLatin(input: unknown): string {
  const raw = String(input ?? "");
  if (!hasArabic(raw)) return raw;

  const norm = normalizeArabic(raw);
  if (!norm) return raw;
  if (AR_CITY[norm]) return AR_CITY[norm];

  const tokens = norm.split(" ").filter(Boolean);
  if (AR_CITY[tokens.join("")]) return AR_CITY[tokens.join("")];

  return tokens
    .map((t) => lookupToken(t) ?? transliterateToken(t))
    .filter(Boolean)
    .join(" ")
    .trim();
}
