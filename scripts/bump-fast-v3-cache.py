from pathlib import Path
import re

app=Path('app.js').read_text()
idx=Path('index.html').read_text()
app=app.replace('./config.js?v=20260831-timeout-1','./config.js?v=20260831-fastv3-1',1)
idx=re.sub(r'app\.js\?v=[^"\']+','app.js?v=20260831-fastv3-1',idx,count=1)
Path('app.js').write_text(app)
Path('index.html').write_text(idx)
