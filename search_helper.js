import dotenv from 'dotenv';
import { createTurathClient } from 'nusus/turath';

dotenv.config();

const turath = createTurathClient({ timeout: 20000 });

// Category mapping in Nusus / Turath
const CATEGORY_MAP = {
  all: [],
  hanafi: ['14'],        // الفقه الحنفي
  hadith: ['6', '7'],    // كتب السنة وشروح الحديث
  tafsir: ['3', '4'],    // التفسير وعلوم القرآن
  usul: ['11', '12'],    // أصول الفقه والقواعد الفقهية
};

async function query(queryString, filter = 'all', limit = 5) {
  try {
    const options = {
      maxPassages: limit,
      maxCharsPerPassage: 1500,
    };

    const categoryIds = CATEGORY_MAP[filter] || [];
    if (categoryIds.length > 0) {
      options.scope = { categoryIds: categoryIds.map(Number) };
    }

    const result = await turath.retrieve(queryString, options);
    const passages = (result?.passages || []).map((p, idx) => ({
      index: idx + 1,
      book: p.book?.title || 'کتاب غیر مسمى',
      author: p.author?.name || 'مصنف نامعلوم',
      category: p.category?.title || null,
      volume: p.location?.volume || null,
      page: p.location?.printedPage || p.location?.internalPage || null,
      text: (p.text || '').trim(),
      url: p.url || (p.book?.id ? `https://app.turath.io/book/${p.book.id}?page=${p.location?.internalPage || 1}` : null),
      shamelaUrl: p.alternateUrls?.shamela || null,
    }));

    return {
      query: queryString,
      filter,
      count: passages.length,
      passages,
    };
  } catch (err) {
    return {
      query: queryString,
      error: err.message || String(err),
      count: 0,
      passages: [],
    };
  }
}

const args = process.argv.slice(2);
const q = args[0] || 'مسح الرأس';
const f = args[1] || 'all';
const l = args[2] ? Number(args[2]) : 5;

query(q, f, l).then((res) => {
  console.log(JSON.stringify(res, null, 2));
  process.exit(0);
}).catch((err) => {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
});
