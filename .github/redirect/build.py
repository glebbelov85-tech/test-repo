"""Builds redirect-only pages for GitHub Pages: every folder of the site
(and 404.html for any other address) sends the visitor to the same path on GitVerse.
Usage: build.py https://<owner>.gitverse.site/<repo> <out-dir>"""
import os
import sys

target = sys.argv[1].rstrip('/')
out = sys.argv[2]

PAGE = '''<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Игра переехала</title>
<meta http-equiv="refresh" content="0; url={url}">
<link rel="canonical" href="{url}">
<script>
(function () {{
  var p = location.pathname.replace(/^\\/[^\\/]+/, '');
  location.replace('{target}' + p + location.search + location.hash);
}})();
</script>
<style>body{{font:18px/1.5 sans-serif;background:#111;color:#eee;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px;text-align:center}}a{{color:#6cf}}</style>
</head>
<body>
<p>Игра переехала на GitVerse.<br><a href="{url}">Открыть новый адрес</a></p>
</body>
</html>
'''

# Installed copies of scp/ and les/ have a service worker that would keep serving
# the old cached game; this one removes itself and reloads the page.
SW = '''self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function () {
  self.registration.unregister().then(function () { return self.clients.matchAll(); })
    .then(function (cs) { cs.forEach(function (c) { c.navigate(c.url); }); });
});
'''


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(text)


root = '.'
for name in sorted(os.listdir(root)):
    if name.startswith('.') or not os.path.isdir(name):
        continue
    url = f'{target}/{name}/'
    write(os.path.join(out, name, 'index.html'), PAGE.format(url=url, target=target))
    if os.path.exists(os.path.join(name, 'sw.js')):
        write(os.path.join(out, name, 'sw.js'), SW)

write(os.path.join(out, 'index.html'), PAGE.format(url=target + '/', target=target))
write(os.path.join(out, '404.html'), PAGE.format(url=target + '/', target=target))
write(os.path.join(out, '.nojekyll'), '')
