import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

/** Compare publication drafts with their authoritative local sources. No network access. */
export async function checkStoreListingText(root) {
  const directory = path.join(root, 'store-listing');
  const read = name => fs.readFile(path.join(directory, name), 'utf8');
  const names = ['README.md', 'listing-ja.txt', 'privacy-practices.md', 'privacy-policy.md', 'reviewer-instructions.txt', 'privacy-policy-url.txt'];
  const texts = Object.fromEntries(await Promise.all(names.map(async name => {
    const text = (await read(name)).trim(); assert.ok(text, name); return [name, text];
  })));
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'Triadic-extension/manifest.template.json'), 'utf8'));
  const section = name => texts['listing-ja.txt'].match(new RegExp(`【${name}】\\s*\\n([^\\n]+)`))?.[1]?.trim();
  assert.equal(section('名前'), manifest.name, '掲載名とManifestの名前が一致しません');
  assert.equal(section('短い説明'), manifest.description, '短い説明とManifestの説明が一致しません');
  const url = texts['privacy-policy-url.txt'];
  const parsed = new URL(url);
  assert.equal(parsed.protocol, 'https:', 'ポリシーURLはHTTPSで指定してください');
  assert.ok(!/\s/.test(url), 'ポリシーURLは一つだけ指定してください');
  for (const name of ['README.md', 'privacy-practices.md']) {
    const urls = texts[name].match(/https:\/\/[^\s`<>\)]+/g) ?? [];
    assert.ok(urls.includes(url), `${name}: ポリシーURLが一致しません`);
  }
}
