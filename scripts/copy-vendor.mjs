import { cp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const root=resolve(import.meta.dirname,'..');
for(const app of ['public-web','client-web','admin-web']) {
  const target=resolve(root,'apps',app,'public/vendor');await mkdir(target,{recursive:true});
  await cp(resolve(root,'node_modules/mathjax/es5'),resolve(target,'mathjax'),{recursive:true});
  await cp(resolve(root,'node_modules/chart.js/dist/chart.umd.js'),resolve(target,'chart.js'));
  await cp(resolve(root,'node_modules/mermaid/dist'),resolve(target,'mermaid'),{recursive:true});
}
