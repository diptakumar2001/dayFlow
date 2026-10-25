"""Build DayFlow for sharing and for the phone app.

You don't need this to run the app — just open index.html. It makes:
  dist/dayflow-single.html  the whole app in one file (fonts and icon inlined)
  dist/artifact.html        the same, as a fragment for claude.ai Artifacts
  www/                      a clean copy of the web files for Capacitor (`npx cap sync`)
"""
import base64, pathlib, re, shutil

root = pathlib.Path(__file__).parent
html = (root / "index.html").read_text(encoding="utf-8")

# ---- www/ for the phone app (Capacitor's webDir) ----
www = root / "www"
shutil.rmtree(www, ignore_errors=True)
www.mkdir()
for name in ["index.html", "manifest.json"]:
    shutil.copy2(root / name, www / name)
for folder in ["css", "js", "fonts", "icons", "images"]:
    shutil.copytree(root / folder, www / folder)

# ---- single-file version ----
def data_uri(path, mime):
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode("ascii")

def inline_css(m):
    css = (root / m.group(1)).read_text(encoding="utf-8")
    # url(../fonts/x.woff2) -> embedded, so the single file still works offline
    css = re.sub(r"url\(\.\./fonts/([^)]+)\)", lambda f: f"url({data_uri(root / 'fonts' / f.group(1), 'font/woff2')})", css)
    css = re.sub(r"url\(\.\./images/([^)]+)\)", lambda f: f"url({data_uri(root / 'images' / f.group(1), 'image/webp')})", css)
    return "<style>\n" + css + "\n</style>"

def inline_js(m):
    return "<script>\n" + (root / m.group(1)).read_text(encoding="utf-8") + "\n</script>"

html = re.sub(r'<link rel="stylesheet" href="(css/[^"]+)">', inline_css, html)
html = re.sub(r'<script src="(js/[^"]+)"></script>', inline_js, html)
html = re.sub(r'<link rel="manifest"[^>]*>\s*', "", html)
html = html.replace('href="icons/icon.svg"', f'href="{data_uri(root / "icons" / "icon.svg", "image/svg+xml")}"')

out = root / "dist" / "dayflow-single.html"
out.parent.mkdir(exist_ok=True)
out.write_text(html, encoding="utf-8")

# Fragment version for claude.ai Artifacts (the host adds <html>/<head>/<body>).
frag = html
for pat in [r"<!doctype html>\s*", r"<html[^>]*>\s*", r"</?head>\s*", r"<body>\s*", r"</body>\s*", r"</html>\s*",
            r'<meta charset="utf-8">\s*', r'<meta name="viewport"[^>]*>\s*']:
    frag = re.sub(pat, "", frag, flags=re.I)
frag = frag.replace("<title>", '<meta name="claude:viewport-fit-sides" content="cover">\n<title>', 1)
(root / "dist" / "artifact.html").write_text(frag, encoding="utf-8")
print("Built", out, "and", www)
