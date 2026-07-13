#!/usr/bin/env node
/* One-shot: apply brand-collision renames to an already-generated
   channels.js (the pipeline that produced it predates the renames). */
import { readFileSync, writeFileSync } from "node:fs";
const p = new URL("../app/js/channels.js", import.meta.url).pathname;
let s = readFileSync(p, "utf8");
s = s.replace(/id: "nickelodeon"/g, 'id: "five-cent-cinema"')
     .replace(/name: "The Nickelodeon"/g, 'name: "Five-Cent Cinema"')
     .replace(/id: "noir-alley"/g, 'id: "shadow-street"')
     .replace(/name: "Noir Alley"/g, 'name: "Shadow Street"');
writeFileSync(p, s);
console.log("renames applied to generated lineup");
