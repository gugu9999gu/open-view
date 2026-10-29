import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {scanProject} from './lib/scanner.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
export function authorizedHost(host,port){return host===`127.0.0.1:${port}`||host===`localhost:${port}`;}
export function createServer({project,port=4317,token=crypto.randomBytes(32).toString('hex')}={}) {
  let scanPromise=null;
  const sameSecret=(a,b)=>{if(typeof a!=='string')return false;const aa=Buffer.from(a),bb=Buffer.from(b);return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb);};
  const server=http.createServer(async(req,res)=>{
    const send=(status,body,type='application/json; charset=utf-8')=>{res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY'});res.end(typeof body==='string'?body:JSON.stringify(body));};
    try {
      if(!authorizedHost(req.headers.host,port))return send(403,{error:'Host denied'});
      const url=new URL(req.url,`http://${req.headers.host}`);
      if(req.headers.origin && req.headers.origin!==`http://${req.headers.host}`)return send(403,{error:'Origin denied'});
      if(req.headers['sec-fetch-site']==='cross-site')return send(403,{error:'Cross-site request denied'});
      if(url.pathname==='/api/session'&&req.method==='POST') {
        if(!sameSecret(req.headers.authorization,`Bearer ${token}`))return send(401,{error:'Invalid session capability'});
        res.setHeader('Set-Cookie',`ov_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`);return send(200,{ok:true});
      }
      if(url.pathname.startsWith('/api/')) {
        const cookies=Object.fromEntries((req.headers.cookie||'').split(';').map(x=>x.trim().split('=')));
        if(!sameSecret(cookies.ov_session,token))return send(401,{error:'Open the capability URL printed by the server.'});
        if(req.method!=='GET')return send(405,{error:'Read-only prototype API'});
        if(url.pathname==='/api/graph') {
          if(!scanPromise)scanPromise=scanProject(project).finally(()=>{scanPromise=null;});
          return send(200,await scanPromise);
        }
        if(url.pathname==='/api/config')return send(200,{project,mode:'static',runtime:'not-implemented'});
        return send(404,{error:'Not found'});
      }
      if(req.method!=='GET'&&req.method!=='HEAD')return send(405,{error:'Method not allowed'});
      if(url.pathname==='/'||url.pathname==='/index.html')return send(200,await fs.readFile(path.join(here,'public/index.html'),'utf8'),'text/html; charset=utf-8');
      if(url.pathname==='/favicon.ico')return send(204,'');
      return send(404,{error:'Not found'});
    }catch(error){console.error(error.message);send(500,{error:'Analysis failed; consult the local terminal.'});}
  });
  return {server,token};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2);const value=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
  if(args.includes('--help')){console.log('node server.mjs --project <trusted-local-folder> --port 4317\nRead-only AST scanner + explicitly simulated interactive UI. No runtime agent yet.');process.exit(0);}
  const port=Number(value('--port','4317'));if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Port must be 1024–65535');
  const project=await fs.realpath(path.resolve(value('--project',path.join(here,'examples/demo-project'))));
  const {server,token}=createServer({project,port});
  server.on('error',e=>{console.error(e.message);process.exitCode=1;});
  server.listen(port,'127.0.0.1',()=>console.log(`Open View — LOCAL ONLY\nProject: ${project}\nhttp://127.0.0.1:${port}/#token=${token}\nThe initial graph is DEMO; select “폴더 분석” for actual static evidence.\nNo target application or cloud database is modified.`));
}
