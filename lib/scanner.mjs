import path from 'node:path';
import crypto from 'node:crypto';
import ts from 'typescript';
import {collectSources} from './source-files.mjs';
import {moduleIdentity, definitionRef} from './source-ref.mjs';
const hash = s => crypto.createHash('sha256').update(s).digest('hex').slice(0,20);
const normalize = p => p.split(path.sep).join('/');
export function routePattern(file) {
  let p = normalize(file).replace(/^src\//,'');
  if (/^(app)\/(?:.*\/)?page\.[jt]sx?$/.test(p)) {
    p = p.slice(4).replace(/(?:^|\/)page\.[jt]sx?$/,'').split('/').filter(x => !/^\(.*\)$/.test(x));
    if (p.some(x => x.startsWith('@') || x.startsWith('('))) return null;
    return '/' + p.join('/');
  }
  if (/^pages\//.test(p) && !/^pages\/(api\/|_|404\.|500\.)/.test(p))
    return '/' + p.slice(6).replace(/\.[jt]sx?$/,'').replace(/(^|\/)index$/,'');
  return null;
}
export async function scanProject(root, options = {}) {
  const {resolvedRoot, files, notices, coverage} = await collectSources(root, options);
  const snapshot = crypto.createHash('sha256');
  for (const file of files) snapshot.update(JSON.stringify([file.relative, file.text]));
  const sourceSnapshotId = 'static:' + snapshot.digest('hex');
  const fileMap = new Map(files.map(f=>[f.full,f]));
  // Compiler host only serves files already accepted by the bounded scanner.
  const host = {
    getSourceFile: (name,languageVersion) => {const f=fileMap.get(path.resolve(name)); return f ? ts.createSourceFile(f.full,f.text,languageVersion,true) : undefined;},
    getDefaultLibFileName: () => '', writeFile:()=>{}, getCurrentDirectory:()=>resolvedRoot,
    getDirectories:()=>[], fileExists:n=>fileMap.has(path.resolve(n)),
    readFile:n=>fileMap.get(path.resolve(n))?.text,
    getCanonicalFileName:n=>n, useCaseSensitiveFileNames:()=>true, getNewLine:()=> '\n',
    resolveModuleNames: (names, containingFile) => names.map(name=> {
      if (!name.startsWith('.')) return undefined;
      const base=path.resolve(path.dirname(containingFile),name);
      const candidates=[base,...['.ts','.tsx','.js','.jsx','/index.ts','/index.tsx','/index.js'].map(e=>base+e)];
      const found=candidates.find(c=>fileMap.has(c));
      return found ? {resolvedFileName:found,isExternalLibraryImport:false} : undefined;
    })
  };
  const program = ts.createProgram(files.map(f=>f.full),{allowJs:true,noLib:true,noEmit:true,target:ts.ScriptTarget.ESNext,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.Preserve},host);
  const checker = program.getTypeChecker();
  const nodes=[], edges=[], functions=new Map(), sources=[], findings=[];
  const addNode = n => {nodes.push(n);return n;};
  const edge = (source,target,kind,evidence) => edges.push({id:hash(source+'|'+target+'|'+kind+'|'+JSON.stringify(evidence)),source,target,kind,basis:'static',evidence});
  const projectId='project:'+hash(resolvedRoot);
  addNode({id:projectId,kind:'project',label:path.basename(resolvedRoot),path:resolvedRoot,basis:'static',status:'scanned'});
  const fnKinds = n => ts.isFunctionDeclaration(n)||ts.isFunctionExpression(n)||ts.isArrowFunction(n)||ts.isMethodDeclaration(n);
  const loc = (sf,n) => ({file:normalize(path.relative(resolvedRoot,sf.fileName)),line:sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1});
  for (const f of files) {
    const sf=program.getSourceFile(f.full); if (!sf) continue; sources.push(sf);
    const id='file:'+hash(f.relative), route=routePattern(f.relative), module=moduleIdentity(resolvedRoot,f.relative,f.text);
    addNode({id,kind:'file',label:path.basename(f.relative),path:f.relative,basis:'static'}); edge(projectId,id,'contains',{file:f.relative});
    if (route!==null) {
      const rid='route:'+hash(f.relative);addNode({id:rid,kind:'route',label:route,path:f.relative,basis:'static',status:route.includes('[')?'needs-parameter':'not-visited'});edge(rid,id,'implemented-by',{file:f.relative});
    }
    if (/(^|\/)(__mocks__|mocks?|fixtures?|seeds?)(\/|\.)/i.test(f.relative)) findings.push({kind:'sample-candidate',file:f.relative,reason:'Mock/fixture/seed path naming; not proof of runtime use.',certainty:'heuristic'});
    function visit(n) {
      if (fnKinds(n) && n.body) {
        const location=loc(sf,n), name=n.name?.getText(sf)||(ts.isVariableDeclaration(n.parent)?n.parent.name.getText(sf):ts.isJsxExpression(n.parent)?'inline handler':'anonymous');
        const ref=definitionRef(module,n.getStart(sf),n.getEnd());
        const fid=ref.definitionId; functions.set(n,fid);
        addNode({id:fid,kind:'function',label:name,path:f.relative,line:location.line,basis:'static',status:'not-observed',sourceRef:{...ref,sourceSnapshotId}});edge(id,fid,'declares',location);
      }
      ts.forEachChild(n,visit);
    } visit(sf);
    for (const imp of sf.statements.filter(ts.isImportDeclaration)) {
      const mod=imp.moduleSpecifier.text;
      if (!mod || mod.startsWith('.')) continue;
      let provider = /supabase/.test(mod)?'Supabase': /firebase\/firestore|@google-cloud\/firestore/.test(mod)?'Firestore': /^(ioredis|redis)$/.test(mod)?'Redis':mod==='pg'?'PostgreSQL':null;
      if(provider) {
        const rid='resource:'+hash(provider);
        if(!nodes.some(n=>n.id===rid)) addNode({id:rid,kind:'resource',label:provider,basis:'static',status:'dependency-only',environment:'unknown',provenance:'unknown'});
        edge(id,rid,'imports-sdk',loc(sf,imp));
      }
      if(/(^|\/)(msw|faker)(\/|$)|@faker-js/.test(mod)) findings.push({kind:'mock-library-import',file:f.relative,line:loc(sf,imp).line,reason:mod,certainty:'static-import'});
    }
    if(sf.parseDiagnostics.length) {
      if (notices.length < coverage.limits.maxNotices) notices.push({kind:'parse-diagnostic',file:f.relative,count:sf.parseDiagnostics.length,partial:true});
      else coverage.suppressedNotices++;
      coverage.status='partial'; coverage.truncated=true;
      if (!coverage.reasons.includes('parse-diagnostic')) coverage.reasons.push('parse-diagnostic');
    }
  }
  function resolveFunction(expr) {
    if(functions.has(expr)) return functions.get(expr);
    let sym=checker.getSymbolAtLocation(ts.isPropertyAccessExpression(expr)?expr.name:expr);
    if(sym?.flags & ts.SymbolFlags.Alias) {try{sym=checker.getAliasedSymbol(sym);}catch{return null;}}
    for(const d of sym?.declarations||[]) {
      if(functions.has(d))return functions.get(d);
      if(d.initializer && functions.has(d.initializer))return functions.get(d.initializer);
    } return null;
  }
  for(const sf of sources) {
    function visit(n,owner=null) {
      const current=functions.get(n)||owner;
      if(ts.isCallExpression(n) && current) {
        const target=resolveFunction(n.expression);
        if(target)edge(current,target,'calls',loc(sf,n));
      }
      if(ts.isJsxAttribute(n) && /^on[A-Z]/.test(n.name.getText(sf)) && n.initializer && ts.isJsxExpression(n.initializer) && n.initializer.expression) {
        const target=resolveFunction(n.initializer.expression);
        if(target)edge('file:'+hash(normalize(path.relative(resolvedRoot,sf.fileName))),target,'handler:'+n.name.getText(sf),loc(sf,n));
      }
      ts.forEachChild(n,c=>visit(c,current));
    }visit(sf);
  }
  return {schemaVersion:2,sourceSnapshotId,mode:'static',root:resolvedRoot,generatedAt:new Date().toISOString(),nodes,edges:[...new Map(edges.map(e=>[e.id,e])).values()],findings,notices,
    coverage:{...coverage,runtime:'not-instrumented',limitations:['Relative imports only; no tsconfig aliases, dynamic imports or full type/data-flow analysis.','Route inference: Next-style app/page and pages file conventions only.','SDK imports do not establish connection, environment, database access, or data authenticity.','No project code is executed; no .env files or request payloads are read.']}};
}
