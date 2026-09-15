#!/usr/bin/env node
import readline from 'readline';
import dotenv from 'dotenv';
import { executeResearchPipeline } from './server/searchService.js';
import { turathProvider } from './server/providers/turathProvider.js';
import { SourceFilterType } from './src/types.js';

dotenv.config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function askPrompt(query: string): Promise<string> {
  return new Promise((resolve) => rl.question(query, resolve));
}

function printDivider(char = '─', len = 65) {
  console.log(char.repeat(len));
}

function printHeader() {
  console.log('\n' + '═'.repeat(65));
  console.log('       بسم الله الرحمن الرحيم - فقہی تحقیقی معاون (CLI)');
  console.log('═'.repeat(65));
  console.log('کتبِ تفاسیر، کتبِ احادیث، اصولِ فقہ اور فقہ اسلامی سے باحوالہ نصوص کی تلاش\n');
}

async function runDirectCorpusSearch(query: string, maxPassages = 5) {
  console.log(`\n🔍 تلاش برائے نصوصِ کتب: "${query}"...`);
  try {
    const res = await turathProvider.retrieve(query, { maxPassages });
    const passages = res?.passages || [];
    if (passages.length === 0) {
      console.log('⚠️ کوئی متعلقہ عبارت نہیں ملی۔ الفاظ تبدیل کر کے دوبارہ کوشش کریں۔');
      return;
    }
    console.log(`\n✅ کل ${passages.length} حوالہ جاتی عبارات برآمد ہوئیں:\n`);
    passages.forEach((p: any, idx: number) => {
      const book = p.book?.title || 'کتاب غیر مسمى';
      const author = p.author?.name || 'مصنف نامعلوم';
      const page = p.location?.printedPage || p.location?.internalPage || '-';
      const vol = p.location?.volume ? `ج: ${p.location.volume}، ` : '';
      console.log(`[حوالہ #${idx + 1}] 📖 ${book} (${author}) | ${vol}ص: ${page}`);
      console.log(`العبارة: ${p.text?.trim()}`);
      printDivider();
    });
  } catch (err: any) {
    console.error('❌ تلاش کے دوران خرابی:', err.message || err);
  }
}

async function runFullResearch(question: string, filter: SourceFilterType = 'all', apiKey?: string) {
  const activeKey = apiKey || process.env.GEMINI_API_KEY;
  
  if (!activeKey) {
    console.log('\n⚠️ خبردار: GEMINI_API_KEY موجود نہیں ہے۔ براہِ راست نصوص تلاش کی جا رہی ہیں...');
    await runDirectCorpusSearch(question);
    return;
  }

  console.log(`\n⏳ تحقیق جاری ہے برائے: "${question}" (فلٹر: ${filter})...`);
  const startTime = Date.now();

  try {
    const res = await executeResearchPipeline(question, filter, { apiKey: activeKey });
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`\n✨ تحقیق مکمل ہو گئی (${elapsed} سیکنڈز)`);
    printDivider('═');

    if (res.answer?.summary) {
      console.log('\n📜 [خلاصۂ جواب و فقہی رائے]:\n');
      console.log(res.answer.summary);
    }

    if (res.answer?.detail) {
      console.log('\n📖 [تفصیلی فقہی تحقیق و مآخذ]:\n');
      console.log(res.answer.detail);
    }
  } catch (err: any) {
    console.error('❌ تحقیق کے دوران خرابی پیش آئی:', err.message || err);
  }
}

async function interactiveLoop() {
  printHeader();
  while (true) {
    const question = await askPrompt('\n✍️ اپنا فقہی یا علمی سوال درج کریں (یا "exit" لکھیں): ');
    const trimmed = question.trim();
    if (!trimmed || trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'quit') {
      console.log('\nاللہ حافظ!');
      rl.close();
      break;
    }

    console.log('\nفلٹر منتخب کریں:');
    console.log('1. تمام مصادر (All)');
    console.log('2. فقہ حنفی (Hanafi)');
    console.log('3. کتب حدیث و سنن (Hadith)');
    console.log('4. تفاسیر قرآن (Tafsir)');
    console.log('5. اصول فقہ و قواعد (Usul)');
    const choice = (await askPrompt('انتخاب [1-5، ڈیفالٹ 1]: ')).trim();

    let filter: SourceFilterType = 'all';
    if (choice === '2') filter = 'hanafi';
    else if (choice === '3') filter = 'hadith';
    else if (choice === '4') filter = 'tafsir';
    else if (choice === '5') filter = 'usul';

    await runFullResearch(trimmed, filter);
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    await interactiveLoop();
    return;
  }

  let question = '';
  let filter: SourceFilterType = 'all';
  let isSearchOnly = false;
  let customKey: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--filter' && args[i + 1]) {
      filter = args[++i] as SourceFilterType;
    } else if (args[i] === '--key' && args[i + 1]) {
      customKey = args[++i];
    } else if (args[i] === '--search-only') {
      isSearchOnly = true;
    } else if (!args[i].startsWith('--')) {
      question += (question ? ' ' : '') + args[i];
    }
  }

  printHeader();

  if (isSearchOnly) {
    await runDirectCorpusSearch(question);
    rl.close();
    return;
  }

  await runFullResearch(question, filter, customKey);
  rl.close();
}

main().catch((err) => {
  console.error('Fatal CLI Error:', err);
  process.exit(1);
});
