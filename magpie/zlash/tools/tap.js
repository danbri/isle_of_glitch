import { readFileSync } from 'node:fs';
import { tapToListing } from '../js/tap.js';
for (const part of tapToListing(new Uint8Array(readFileSync(process.argv[2])))) {
  if (part.listing !== undefined) { console.log(`--- Program "${part.name}"${part.autostart !== null ? ` (RUN at ${part.autostart})` : ''} ---`); console.log(part.listing); }
  else console.log(`--- ${part.type} "${part.name}": ${part.length} bytes at ${part.address} ---`);
}
