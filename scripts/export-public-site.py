#!/usr/bin/env python3
"""Export public current-version attachments to a read-only static site with no runtime dependencies.

After npm run build, run python3 scripts/export-public-site.py --seed --date YYYY-MM-DD -o out.zip.
For a refreshed live snapshot, use --origin https://… instead of --seed; unpublished IDs are skipped.
"""
from __future__ import annotations
import argparse, hashlib, html, json, os, re, subprocess, tempfile, zipfile
from contextlib import contextmanager
from datetime import date, datetime
from functools import partial
from pathlib import Path
from urllib.parse import quote, urlsplit
from urllib.request import urlopen
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
WECHAT = '17384338201'
E = partial(html.escape, quote=True)
CSS = """
*{box-sizing:border-box}html{color-scheme:light;scroll-behavior:smooth;scroll-padding-top:16px}body{margin:0;background:#f6f5ee;color:#202c25;font:16px/1.65 system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;overflow-wrap:anywhere}main,footer,header{max-width:850px;margin:auto;padding-inline:clamp(16px,5vw,44px)}header{padding-top:26px;display:flex;gap:12px;justify-content:space-between;align-items:center}header strong{color:#325a45}header span,.muted,small{color:#4e6256}header span{font-size:.85rem}h1,h2,h3,p{margin:0}h1,h2{font-family:ui-serif,"Songti SC",STSong,serif}h1{margin:26px 0 4px;font-size:clamp(34px,6vw,52px);line-height:1.3}h2{font-size:1.55rem;margin:32px 0 8px}h3{font-size:1.12rem;line-height:1.45}nav{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}a{color:#225c40}a:focus-visible,summary:focus-visible{outline:3px solid #235c41;outline-offset:3px}nav a,.button{display:inline-flex;align-items:center;min-height:44px;border-radius:9px;padding:6px 13px;text-decoration:none;background:#e1eae0;color:#244c32;font-weight:650}nav a{border:1px solid #ccdbcf;background:transparent}section>p{margin-bottom:10px}article{padding:18px clamp(14px,3vw,22px);margin:10px 0;background:#fff;border:1px solid #e0e4db;border-radius:14px}article>p{margin:5px 0}.file{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;border-top:1px solid #e7eae2;padding-top:9px;margin-top:9px}.file>span{flex:1 1 230px;min-width:0}.actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.actions a{min-height:44px;display:inline-flex;align-items:center}.filename{font-size:.9rem}.meta{font-size:.8rem;color:#556a59}.terms{background:#e9eee5;padding:15px 18px;border-radius:10px;margin:16px 0}summary{cursor:pointer;min-height:44px;display:list-item;padding:9px 0}dl{margin:0}dt{font-weight:650}dd{margin:0 0 7px}footer{padding-block:26px 40px}section[id]{scroll-margin-top:14px}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
"""

@contextmanager
def catalog_origin(live):
    if live:
        u = urlsplit(live)
        if u.scheme != 'https' or not u.netloc or u.query or u.fragment or u.username or u.password or u.path not in ('','/'):
            raise ValueError('Provide a public HTTPS origin without path or credentials')
        yield live.rstrip('/')
        return
    with tempfile.TemporaryDirectory() as temp:
        env = {**os.environ, 'DATA_DIR':temp, 'PORT':'0'}
        env.pop('DEV_ADMIN_TOKEN',None)
        with subprocess.Popen(['node', 'dev.mjs'], cwd=ROOT, env=env, stdout=subprocess.PIPE, text=True) as proc:
            try:
                line = proc.stdout.readline().strip()
                m = re.fullmatch(r'Resources: (http://127\.0\.0\.1:\d+)/resources',line)
                if not m: raise RuntimeError('Local public export adapter failed: '+line)
                yield m.group(1)
            finally:
                proc.terminate()

def read_endpoint(origin, path):
    with urlopen(origin+path,timeout=40) as response:
        return response.read(),response.headers.get_content_type()

def load_json(origin,path):
    body,ctype=read_endpoint(origin,path)
    if ctype!='application/json': raise ValueError('Public API did not return JSON: '+path)
    return json.loads(body)

def generate(origin, stamp):
    archive = json.loads((ROOT/'seed/archive24.json').read_text())
    allow = {'xigai-guide','xigai-practice',*(item['id'] for item in archive)}
    notice = re.search(r"^const archiveNotice='([^']+)';", (ROOT/'src/ui.js').read_text(), re.M)[1]
    catalog = load_json(origin,'/api/catalog')
    groups, files, manifest = {}, {}, []
    seen = set()
    for entry in sorted(catalog['items'],key=lambda e:(e['year']=='往年资料', e['subject'], e['title'])):
        rid=entry['id']
        if rid not in allow or rid in seen: continue
        seen.add(rid)
        data=load_json(origin,'/api/resource/'+quote(rid,safe=''))
        r=data['resource']
        if r['status']!='published': continue
        v=next(v for v in data['versions'] if v['id']==r['current'])
        rows=[]
        for a in v['files']:
            if not a['enabled']: continue
            ext=a['ext'].lower()
            if ext not in ('pdf','docx','jpg','jpeg','png','pptx','xlsx','webp'): raise ValueError('Unknown file format')
            aid=a['id']
            if not re.fullmatch(r'[a-zA-Z0-9-]+',aid): raise ValueError('Invalid attachment ID')
            raw,ctype=read_endpoint(origin,'/file/'+aid)
            if len(raw)!=a['size'] or ctype in ('text/html','text/plain','application/json'): raise ValueError('Invalid attachment response '+aid)
            filename=a['name']
            if '/' in filename or '\\' in filename or filename in ('','.','..'): raise ValueError('Invalid filename')
            path=f'files/{aid}/{filename}'
            if path in files: raise ValueError('Duplicate attachment '+aid)
            files[path]=raw
            manifest.append({'resource':rid,'version':v['label'],'path':path,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()})
            link=quote(path)
            preview=f'<a href="{link}">打开预览</a>' if ext in ('pdf','jpg','jpeg','png','webp') else ''
            rows.append(f'<div class="file"><span><span class="filename">{E(filename)}</span><br><small>{E(ext.upper())} · {len(raw)/1024:.0f} KB</small></span><span class="actions">{preview}<a class="button" href="{link}" download="{E(filename)}">下载</a></span></div>')
        if not rows: continue
        details = [
            ('公开署名',r['author']),('教材',r['textbook']),('来源',v['source']),('AI 参与',v['ai']),
            ('人工核对',v['checkStatus']),('核对范围',v['scope']),('核对时间',v['checked']),('已知问题',v['issues']),('修订摘要',v['revision'])
        ]
        dl=''.join(f'<dt>{key}</dt><dd>{E(value)}</dd>' for key,value in details if value)
        card=f'<article id="{E(rid)}"><p class="meta">{E(r["year"])}　/　{E(v["label"])}</p><h3>{E(r["title"])}</h3><p>{E(r["summary"])}</p><details><summary>制作说明与核对范围</summary><dl>{dl}</dl></details>{"".join(rows)}</article>'
        groups.setdefault(r['subject'],[]).append(card)
    section_links=[]; sections=[]
    for i,(subject,cards) in enumerate(groups.items()):
        section_links.append(f'<a href="#s{i}">{E(subject)} · {len(cards)}</a>')
        sections.append(f'<section id="s{i}"><h2>{E(subject)}</h2>{"".join(cards)}</section>')
    total=sum(map(len,groups.values()))
    page=f"""<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>小博土期末资料库 · 备用目录</title><style>{CSS}</style></head>
<body><header id="top"><strong>小博土 / 学习资料</strong><span>只读备用站</span></header><main><h1>期末资料备用目录</h1><p class="muted">{stamp} 北京时间快照 · {total} 份资料 · {len(files)} 个文件</p><p>选择科目，展开制作说明，或直接免费下载。离线使用请先完整解压，再打开 index.html。</p><nav aria-label="科目目录">{''.join(section_links)}</nav>
<div class="terms"><strong>使用说明</strong><p>{E(notice)} 本站由学生个人维护，与学校官方无隶属关系。</p><p>内容纠错或权利反馈请联系小博土，微信 <b>{WECHAT}</b>。请附资料名称、版本及页码。</p></div>
{''.join(sections)}</main><footer><p>此快照不会自动同步后续修订或撤回。更新备用站时，请整体替换上个版本。</p><a href="#top">返回目录 ↑</a></footer></body></html>"""
    files['index.html']=page.encode()
    files['manifest.json']=json.dumps({'snapshot':stamp,'timezone':'Asia/Shanghai','resources':total,'files':manifest},ensure_ascii=False,indent=2).encode()
    return files, manifest, total

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    scope=ap.add_mutually_exclusive_group(required=True)
    scope.add_argument('--origin');scope.add_argument('--seed',action='store_true')
    ap.add_argument('--date',type=date.fromisoformat,default=datetime.now(ZoneInfo('Asia/Shanghai')).date())
    ap.add_argument('-o','--output',type=Path,required=True)
    args=ap.parse_args()
    with catalog_origin(args.origin) as origin:
        files,manifest,total=generate(origin,args.date.isoformat())
    if args.seed and (total,len(manifest))!=(14,16): raise ValueError('Expected all 14 seed records and 16 files')
    if not manifest: raise ValueError('No public attachments')
    args.output.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=args.output.parent,delete=False) as temp:
        tmp=Path(temp.name)
    try:
        with zipfile.ZipFile(tmp,'w') as out:
            for name,raw in sorted(files.items()):
                info=zipfile.ZipInfo(name,(*args.date.timetuple()[:3],0,0,0))
                info.external_attr=0o100644<<16
                out.writestr(info,raw,compress_type=zipfile.ZIP_DEFLATED,compresslevel=6)
        with zipfile.ZipFile(tmp) as out:
            for f in manifest:
                assert hashlib.sha256(out.read(f['path'])).hexdigest()==f['sha256']
        tmp.replace(args.output)
    finally: tmp.unlink(missing_ok=True)
    print(f'{total} public resources / {len(manifest)} verified attachments -> {args.output}')

if __name__=='__main__': main()
