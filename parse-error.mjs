import { compile, parse } from '@vue/compiler-dom';
import fs from 'fs';

const html = fs.readFileSync('C:/Users/abdalla.a/AppData/Local/Temp/opencode/react-rendered.html', 'utf-8');
const sfc = `<template><div>${html}</div></template>`;

try {
  compile(sfc);
} catch (e) {
  // Parse the error for more details
  const fullError = e.message;
  console.log('Full error:');
  console.log(fullError);
}

// Try parsing to get more details
try {
  const ast = parse(sfc);
  console.log('\nParse result - errors:', ast.errors?.length);
  if (ast.errors) {
    for (const err of ast.errors) {
      console.log('Error:', err.message, 'at line', err.loc?.start?.line, 'col', err.loc?.start?.column);
    }
  }
} catch (e) {
  console.log('Parse error:', e.message.substring(0, 500));
}