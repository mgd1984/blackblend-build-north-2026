#!/usr/bin/env node
import { keychain } from '../tt-video.mjs';
import { stdin, stdout } from 'node:process';

if (!stdin.isTTY) throw Error('Run this command in an interactive terminal.');
stdout.write('Blackblend OpenAI key (hidden): ');
stdin.setRawMode(true);
stdin.resume();
let secret = '';
await new Promise((resolve, reject) => {
  function finish(error) {
    stdin.off('data', read); stdin.setRawMode(false); stdin.pause(); stdout.write('\n');
    error ? reject(error) : resolve();
  }
  function read(chunk) {
    for (const character of chunk.toString()) {
      if (character === '\u0003' || character === '\u0004') return finish(Error('Key entry cancelled.'));
      if (character === '\r' || character === '\n') return finish();
      if (character === '\u007f' || character === '\b') secret = secret.slice(0, -1);
      else if (character >= ' ') secret += character;
    }
  }
  stdin.on('data', read);
});
if (!/^sk-[A-Za-z0-9_-]{20,}$/.test(secret.trim())) throw Error('That does not look like an OpenAI API key. Nothing was saved.');
await keychain('set', secret.trim(), 'openai');
secret = '';
stdout.write('Saved to macOS Keychain: blackblend.openai / api-key.\n');
